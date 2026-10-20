"""Keycloak / OpenID Connect SSO service and helpers.

Supports configuration via:
1. Helm / Environment variables (highest priority):
   - KEYCLOAK_ENABLED ("true" / "1")
   - KEYCLOAK_SERVER_URL (e.g. "https://keycloak.example.com" or "http://keycloak:8080")
   - KEYCLOAK_REALM (e.g. "kure" or "master")
   - KEYCLOAK_CLIENT_ID (e.g. "kure-monitor")
   - KEYCLOAK_CLIENT_SECRET
   - KEYCLOAK_ADMIN_ROLE (default: "kure-admin")
   - KEYCLOAK_SCOPES (default: "openid profile email")

2. UI / Database `app_settings` under key "keycloak_sso_config" (JSON object):
   - {
       "enabled": bool,
       "server_url": str,
       "realm": str,
       "client_id": str,
       "client_secret": str,
       "admin_role": str,
       "scopes": str
     }
"""

import json
import logging
import os
import urllib.parse
from typing import Any, Dict, Optional, Tuple
import aiohttp

logger = logging.getLogger(__name__)

KEYCLOAK_CONFIG_SETTING_KEY = "keycloak_sso_config"
DEFAULT_ADMIN_ROLE = "kure-admin"
DEFAULT_ADMIN_GROUP = "kure-admin"
DEFAULT_SCOPES = "openid profile email"


async def get_sso_config(db, include_secret: bool = False) -> Dict[str, Any]:
    """Resolve Keycloak SSO configuration with env var > DB app_settings precedence.

    Returns dict:
      {
        "enabled": bool,
        "server_url": str,
        "realm": str,
        "client_id": str,
        "client_secret": str (or "***" if not include_secret),
        "admin_role": str,
        "admin_group": str,
        "allowed_groups": str,
        "scopes": str,
        "source": "env" | "db" | "none"
      }
    """
    env_enabled_str = os.environ.get("KEYCLOAK_ENABLED")
    env_server_url = os.environ.get("KEYCLOAK_SERVER_URL")
    env_realm = os.environ.get("KEYCLOAK_REALM")
    env_client_id = os.environ.get("KEYCLOAK_CLIENT_ID")
    env_client_secret = os.environ.get("KEYCLOAK_CLIENT_SECRET")
    env_admin_role = os.environ.get("KEYCLOAK_ADMIN_ROLE")
    env_admin_group = os.environ.get("KEYCLOAK_ADMIN_GROUP")
    env_allowed_groups = os.environ.get("KEYCLOAK_ALLOWED_GROUPS")
    env_scopes = os.environ.get("KEYCLOAK_SCOPES")
    env_insecure_skip_verify = os.environ.get("KEYCLOAK_INSECURE_SKIP_TLS_VERIFY")

    # If any env var is set, env config is active
    if env_server_url or env_enabled_str is not None:
        is_enabled = (env_enabled_str or "").lower() in ("true", "1", "yes")
        secret = env_client_secret or ""
        insecure = (env_insecure_skip_verify or "").lower() in ("true", "1", "yes")
        return {
            "enabled": is_enabled,
            "server_url": (env_server_url or "").rstrip("/"),
            "realm": env_realm or "",
            "client_id": env_client_id or "",
            "client_secret": secret if include_secret else ("***" if secret else ""),
            "admin_role": env_admin_role or DEFAULT_ADMIN_ROLE,
            "admin_group": env_admin_group or "",
            "allowed_groups": env_allowed_groups or "",
            "scopes": env_scopes or DEFAULT_SCOPES,
            "insecure_skip_tls_verify": insecure,
            "source": "env",
        }

    # Otherwise look in DB app_settings
    if db is not None:
        try:
            stored = await db.get_app_setting(KEYCLOAK_CONFIG_SETTING_KEY)
            if stored:
                cfg = json.loads(stored)
                secret = cfg.get("client_secret", "")
                return {
                    "enabled": bool(cfg.get("enabled", False)),
                    "server_url": (cfg.get("server_url", "") or "").rstrip("/"),
                    "realm": cfg.get("realm", "") or "",
                    "client_id": cfg.get("client_id", "") or "",
                    "client_secret": secret if include_secret else ("***" if secret else ""),
                    "admin_role": cfg.get("admin_role") or DEFAULT_ADMIN_ROLE,
                    "admin_group": cfg.get("admin_group") or "",
                    "allowed_groups": cfg.get("allowed_groups") or "",
                    "scopes": cfg.get("scopes") or DEFAULT_SCOPES,
                    "insecure_skip_tls_verify": bool(cfg.get("insecure_skip_tls_verify", False)),
                    "source": "db",
                }
        except Exception as e:
            logger.warning(f"Failed to read SSO config from DB: {e}")

    return {
        "enabled": False,
        "server_url": "",
        "realm": "",
        "client_id": "",
        "client_secret": "",
        "admin_role": DEFAULT_ADMIN_ROLE,
        "admin_group": "",
        "allowed_groups": "",
        "scopes": DEFAULT_SCOPES,
        "insecure_skip_tls_verify": False,
        "source": "none",
    }


async def save_sso_config(db, config: Dict[str, Any]) -> Dict[str, Any]:
    """Save SSO configuration in app_settings (used by UI Admin).

    If client_secret is "***" or empty, preserves existing stored secret.
    """
    existing_raw = await db.get_app_setting(KEYCLOAK_CONFIG_SETTING_KEY)
    existing = {}
    if existing_raw:
        try:
            existing = json.loads(existing_raw)
        except Exception:
            existing = {}

    secret = config.get("client_secret", "")
    if not secret or secret == "***":
        secret = existing.get("client_secret", "")

    new_cfg = {
        "enabled": bool(config.get("enabled", False)),
        "server_url": (config.get("server_url", "") or "").strip().rstrip("/"),
        "realm": (config.get("realm", "") or "").strip(),
        "client_id": (config.get("client_id", "") or "").strip(),
        "client_secret": secret,
        "admin_role": (config.get("admin_role", "") or "").strip() or DEFAULT_ADMIN_ROLE,
        "admin_group": (config.get("admin_group", "") or "").strip(),
        "allowed_groups": (config.get("allowed_groups", "") or "").strip(),
        "scopes": (config.get("scopes", "") or "").strip() or DEFAULT_SCOPES,
        "insecure_skip_tls_verify": bool(config.get("insecure_skip_tls_verify", False)),
    }

    await db.set_app_setting(KEYCLOAK_CONFIG_SETTING_KEY, json.dumps(new_cfg))
    return {
        **new_cfg,
        "client_secret": "***" if new_cfg["client_secret"] else "",
        "source": "db",
    }


def get_keycloak_endpoints(server_url: str, realm: str) -> Dict[str, str]:
    """Derive standard Keycloak OIDC endpoints for given server_url and realm."""
    base = f"{server_url.rstrip('/')}/realms/{realm}"
    return {
        "authorization_endpoint": f"{base}/protocol/openid-connect/auth",
        "token_endpoint": f"{base}/protocol/openid-connect/token",
        "userinfo_endpoint": f"{base}/protocol/openid-connect/userinfo",
        "end_session_endpoint": f"{base}/protocol/openid-connect/logout",
        "issuer": base,
    }


def build_authorization_url(
    config: Dict[str, Any], redirect_uri: str, state: str
) -> str:
    """Build the Keycloak OIDC authorization URL."""
    endpoints = get_keycloak_endpoints(config["server_url"], config["realm"])
    params = {
        "client_id": config["client_id"],
        "response_type": "code",
        "scope": config.get("scopes") or DEFAULT_SCOPES,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return f"{endpoints['authorization_endpoint']}?{urllib.parse.urlencode(params)}"


async def exchange_code_for_token(
    config: Dict[str, Any], code: str, redirect_uri: str
) -> Dict[str, Any]:
    """Exchange authorization code for token with Keycloak."""
    endpoints = get_keycloak_endpoints(config["server_url"], config["realm"])
    data = {
        "grant_type": "authorization_code",
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "code": code,
        "redirect_uri": redirect_uri,
    }

    skip_verify = bool(config.get("insecure_skip_tls_verify"))
    connector = aiohttp.TCPConnector(ssl=False) if skip_verify else None
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        async with session.post(endpoints["token_endpoint"], data=data) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error(f"Keycloak token exchange failed (HTTP {resp.status}): {body}")
                raise ValueError(f"Failed to exchange token with Keycloak: HTTP {resp.status}")
            return await resp.json()


async def get_user_info(
    config: Dict[str, Any], access_token: str
) -> Dict[str, Any]:
    """Fetch user info from Keycloak userinfo endpoint."""
    endpoints = get_keycloak_endpoints(config["server_url"], config["realm"])
    headers = {"Authorization": f"Bearer {access_token}"}

    skip_verify = bool(config.get("insecure_skip_tls_verify"))
    connector = aiohttp.TCPConnector(ssl=False) if skip_verify else None
    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
        async with session.get(endpoints["userinfo_endpoint"], headers=headers) as resp:
            if resp.status != 200:
                body = await resp.text()
                logger.error(f"Keycloak userinfo failed (HTTP {resp.status}): {body}")
                raise ValueError(f"Failed to fetch userinfo from Keycloak: HTTP {resp.status}")
            return await resp.json()
