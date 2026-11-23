import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlsplit, urlunsplit

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("kure.audit")

REDACTED_KEYS = frozenset(
    {
        "api_key",
        "password",
        "new_password",
        "current_password",
        "client_secret",
        "webhook_url",
        "secret",
        "token",
        "bot_token",
        "signing_secret",
        "proxy_password",
    }
)


def _redact_url_credentials(url: str) -> str:
    """Mask user:pass@ in URLs such as proxy_url."""
    try:
        parts = urlsplit(url)
        if parts.username or parts.password:
            host = parts.hostname or ""
            if parts.port:
                host = f"{host}:{parts.port}"
            return urlunsplit(
                (parts.scheme, f"***:***@{host}", parts.path, parts.query, parts.fragment)
            )
    except Exception:
        pass
    return url


def sanitize_details(obj: Any) -> Any:
    """Recursively redact secrets from audit detail payloads."""
    if isinstance(obj, dict):
        cleaned: Dict[str, Any] = {}
        for k, v in obj.items():
            kl = str(k).lower()
            if kl in REDACTED_KEYS or "secret" in kl or "password" in kl:
                cleaned[k] = "[REDACTED]" if v else None
            elif kl == "proxy_url" and isinstance(v, str):
                cleaned[k] = _redact_url_credentials(v)
            else:
                cleaned[k] = sanitize_details(v)
        return cleaned
    if isinstance(obj, list):
        return [sanitize_details(item) for item in obj[:50]]
    if isinstance(obj, str) and len(obj) > 500:
        return obj[:500] + "...(truncated)"
    return obj


# (HTTP_METHOD, compiled_regex, action_name, resource_type)
AUDIT_ROUTE_RULES: List[Tuple[str, re.Pattern, str, str]] = [
    # 1. Pod Monitoring & Mirror Pods
    ("DELETE", re.compile(r"^/api/pods/failed/(?P<resource>[^/]+)$"), "pod.dismiss", "pod_failure"),
    ("POST", re.compile(r"^/api/mirror/deploy/(?P<resource>[^/]+)$"), "mirror.deploy", "mirror_pod"),
    ("DELETE", re.compile(r"^/api/mirror/(?P<resource>[^/]+)$"), "mirror.delete", "mirror_pod"),
    # 2. AI / LLM Configuration
    ("POST", re.compile(r"^/api/admin/llm/configs$"), "llm_config.create", "llm_config"),
    ("PUT", re.compile(r"^/api/admin/llm/configs/(?P<resource>[^/]+)$"), "llm_config.update", "llm_config"),
    ("DELETE", re.compile(r"^/api/admin/llm/configs/(?P<resource>[^/]+)$"), "llm_config.delete", "llm_config"),
    ("POST", re.compile(r"^/api/admin/llm/configs/(?P<resource>[^/]+)/default$"), "llm_config.set_default", "llm_config"),
    ("PUT", re.compile(r"^/api/admin/llm/instructions$"), "llm_instructions.update", "llm_instructions"),
    ("DELETE", re.compile(r"^/api/admin/llm/instructions$"), "llm_instructions.delete", "llm_instructions"),
    # 3. Security Scanner & Exclusions
    ("DELETE", re.compile(r"^/api/security/findings/(?P<resource>[^/]+)$"), "security_finding.dismiss", "security_finding"),
    ("PUT", re.compile(r"^/api/security/findings/(?P<resource>[^/]+)/restore$"), "security_finding.restore", "security_finding"),
    ("POST", re.compile(r"^/api/security/rescan$"), "security.rescan", "security_scan"),
    ("POST", re.compile(r"^/api/admin/trusted-registries$"), "trusted_registry.add", "trusted_registry"),
    ("DELETE", re.compile(r"^/api/admin/trusted-registries/(?P<resource>.+)$"), "trusted_registry.remove", "trusted_registry"),
    ("POST", re.compile(r"^/api/admin/excluded-namespaces$"), "excluded_namespace.add", "excluded_namespace"),
    ("DELETE", re.compile(r"^/api/admin/excluded-namespaces/(?P<resource>[^/]+)$"), "excluded_namespace.remove", "excluded_namespace"),
    ("POST", re.compile(r"^/api/admin/excluded-pods$"), "excluded_pod.add", "excluded_pod"),
    ("DELETE", re.compile(r"^/api/admin/excluded-pods/(?P<resource>[^/]+)$"), "excluded_pod.remove", "excluded_pod"),
    ("POST", re.compile(r"^/api/admin/excluded-rules$"), "excluded_rule.add", "excluded_rule"),
    ("DELETE", re.compile(r"^/api/admin/excluded-rules/(?P<resource>.+)$"), "excluded_rule.remove", "excluded_rule"),
    # 4. AI Advice
    ("DELETE", re.compile(r"^/api/advice/findings/(?P<resource>[^/]+)$"), "advice_finding.dismiss", "advice_finding"),
    ("PUT", re.compile(r"^/api/advice/findings/(?P<resource>[^/]+)/restore$"), "advice_finding.restore", "advice_finding"),
    ("PUT", re.compile(r"^/api/advice/detectors/(?P<resource>[^/]+)$"), "advice_detector.update", "advice_detector"),
    ("POST", re.compile(r"^/api/advice/scan$"), "advice.scan", "advice_scan"),
    # 5. Notifications & SSO
    ("POST", re.compile(r"^/api/admin/notifications$"), "notification.save", "notification"),
    ("PUT", re.compile(r"^/api/admin/notifications/(?P<resource>[^/]+)$"), "notification.update", "notification"),
    ("DELETE", re.compile(r"^/api/admin/notifications/(?P<resource>[^/]+)$"), "notification.delete", "notification"),
    ("POST", re.compile(r"^/api/admin/sso/config$"), "sso.update", "sso_config"),
    ("PUT", re.compile(r"^/api/admin/audit-logs/retention$"), "audit_retention.update", "audit_settings"),
    # 6. Auth, Users & Teams (RBAC)
    ("POST", re.compile(r"^/api/auth/login$"), "auth.login", "auth"),
    ("POST", re.compile(r"^/api/auth/logout$"), "auth.logout", "auth"),
    ("POST", re.compile(r"^/api/admin/invitations$"), "user.invite", "invitation"),
    ("DELETE", re.compile(r"^/api/admin/invitations/(?P<resource>[^/]+)$"), "user.invite_revoke", "invitation"),
    ("PATCH", re.compile(r"^/api/admin/users/(?P<resource>[^/]+)$"), "user.update_role", "user"),
    ("DELETE", re.compile(r"^/api/admin/users/(?P<resource>[^/]+)$"), "user.delete", "user"),
    ("POST", re.compile(r"^/api/admin/teams$"), "team.create", "team"),
    ("PUT", re.compile(r"^/api/admin/teams/(?P<resource>[^/]+)$"), "team.update", "team"),
    ("DELETE", re.compile(r"^/api/admin/teams/(?P<resource>[^/]+)$"), "team.delete", "team"),
    ("POST", re.compile(r"^/api/admin/teams/(?P<resource>[^/]+)/members$"), "team_member.add", "team"),
    ("DELETE", re.compile(r"^/api/admin/teams/(?P<resource>[^/]+)/members/(?P<member>[^/]+)$"), "team_member.remove", "team"),
]


def match_audit_route(method: str, path: str) -> Optional[Tuple[str, str, Optional[str]]]:
    """Return (action, resource_type, resource_name) if the request matches an auditable route."""
    m = method.upper()
    if m not in ("POST", "PUT", "PATCH", "DELETE"):
        return None
    for rule_method, pattern, action, resource_type in AUDIT_ROUTE_RULES:
        if rule_method != m:
            continue
        match = pattern.match(path)
        if match:
            groups = match.groupdict()
            res = groups.get("resource")
            if groups.get("member"):
                res = f"{res}/member:{groups['member']}"
            return action, resource_type, res
    return None


def _get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class AuditMiddleware(BaseHTTPMiddleware):
    """Records auditable mutating API requests to PostgreSQL and structured stdout JSON."""

    async def dispatch(self, request: Request, call_next):
        matched = match_audit_route(request.method, request.url.path)
        if not matched:
            return await call_next(request)

        action, resource_type, resource_name = matched
        body_details: Dict[str, Any] = {}

        # Safely read JSON body while preserving it for downstream route handlers
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                raw_body = await request.body()
                if raw_body:
                    parsed = json.loads(raw_body)
                    if isinstance(parsed, dict):
                        body_details = sanitize_details(parsed)
            except Exception:
                body_details = {}

        response = await call_next(request)

        try:
            user = getattr(request.state, "user", None)
            actor_id = user.get("id") if isinstance(user, dict) else None
            actor_username = (
                user.get("username")
                if isinstance(user, dict) and user.get("username")
                else body_details.get("username") or "anonymous"
            )
            actor_role = user.get("role") if isinstance(user, dict) else None

            status = "success" if response.status_code < 400 else "failed"
            effective_action = (
                "auth.login_failed"
                if action == "auth.login" and status == "failed"
                else action
            )

            # Enrich resource_name from body if not in path
            if not resource_name and body_details:
                resource_name = str(
                    body_details.get("name")
                    or body_details.get("registry")
                    or body_details.get("namespace")
                    or body_details.get("pod_name")
                    or body_details.get("rule_title")
                    or body_details.get("provider")
                    or body_details.get("username")
                    or ""
                ) or None

            ip_address = _get_client_ip(request)
            details = {
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
            }
            if body_details:
                details["payload"] = body_details

            # 1. Emit structured JSON to stdout for external SIEM / Loki ingestion
            audit_logger.info(
                json.dumps(
                    {
                        "audit": True,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "actor_id": actor_id,
                        "actor": actor_username,
                        "role": actor_role,
                        "action": effective_action,
                        "resource_type": resource_type,
                        "resource_name": resource_name,
                        "ip": ip_address,
                        "status": status,
                        "details": details,
                    },
                    default=str,
                )
            )

            # 2. Persist to PostgreSQL audit_logs table & broadcast to admin WS clients
            db = getattr(request.app.state, "db", None)
            row_id = None
            if db and hasattr(db, "insert_audit_log"):
                row_id = await db.insert_audit_log(
                    action=effective_action,
                    actor_username=str(actor_username),
                    actor_role=actor_role,
                    actor_id=actor_id,
                    resource_type=resource_type,
                    resource_name=resource_name,
                    ip_address=ip_address,
                    status=status,
                    details=details,
                )

            ws_mgr = getattr(request.app.state, "websocket_manager", None)
            if ws_mgr and hasattr(ws_mgr, "broadcast_audit_log"):
                await ws_mgr.broadcast_audit_log(
                    {
                        "id": row_id,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "actor_id": actor_id,
                        "actor_username": str(actor_username),
                        "actor_role": actor_role,
                        "action": effective_action,
                        "resource_type": resource_type,
                        "resource_name": resource_name,
                        "ip_address": ip_address,
                        "status": status,
                        "details": details,
                    }
                )
        except Exception as e:
            logger.warning(f"Failed to record audit log for {action}: {e}")

        return response
