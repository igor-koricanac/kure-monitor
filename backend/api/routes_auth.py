"""Auth routes: setup, login, logout, invitations, me."""

import logging
import secrets
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from .auth import (
    check_login_rate_limit,
    clear_login_attempts,
    clear_session_cookie,
    hash_password,
    issue_session_cookie,
    record_failed_login,
    require_admin,
    require_user,
    verify_password,
)
from .auth_sso import (
    build_authorization_url,
    exchange_code_for_token,
    get_sso_config,
    get_user_info,
    save_sso_config,
)
from .deps import RouterDeps

logger = logging.getLogger(__name__)


class SSOSettingsRequest(BaseModel):
    enabled: bool = False
    server_url: str = ""
    realm: str = ""
    client_id: str = ""
    client_secret: Optional[str] = None
    admin_role: Optional[str] = "kure-admin"
    admin_group: Optional[str] = ""
    allowed_groups: Optional[str] = ""
    scopes: Optional[str] = "openid profile email"
    insecure_skip_tls_verify: bool = False


class SetupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8)
    email: Optional[str] = Field(None, max_length=255)


class LoginRequest(BaseModel):
    username: str
    password: str


class AcceptInvitationRequest(BaseModel):
    token: str
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=8)
    email: Optional[str] = Field(None, max_length=255)


def _public_user(user: dict, permissions: Optional[dict] = None) -> dict:
    """Return the public-safe subset of a user row along with their effective permissions."""
    data = {
        "id": user["id"],
        "username": user["username"],
        "email": user.get("email"),
        "role": user["role"],
    }
    if permissions:
        data.update({
            "has_team": permissions.get("has_team", False),
            "effective_access_level": permissions.get("access_level", "read"),
            "effective_tabs": permissions.get("tabs", []),
            "effective_namespaces": permissions.get("namespaces", []),
            "all_namespaces": permissions.get("all_namespaces", False),
            "teams": permissions.get("teams", []),
        })
    elif user.get("role") == "admin":
        data.update({
            "has_team": True,
            "effective_access_level": "write",
            "effective_tabs": ["pod_monitoring", "security_scanner", "diagram", "ai_advice", "admin"],
            "effective_namespaces": [],
            "all_namespaces": True,
            "teams": [],
        })
    else:
        data.update({
            "has_team": user.get("has_team", False),
            "effective_access_level": user.get("access_level", "read"),
            "effective_tabs": user.get("tabs", []),
            "effective_namespaces": user.get("namespaces", []),
            "all_namespaces": user.get("all_namespaces", False),
            "teams": user.get("teams", []),
        })
    return data


def create_auth_router(deps: RouterDeps) -> APIRouter:
    """Public auth endpoints (no auth required)."""
    router = APIRouter()
    db = deps.db

    @router.get("/auth/setup-required")
    async def setup_required():
        """Return whether initial admin setup is required (no users exist)."""
        count = await db.count_users()
        return {"setup_required": count == 0}

    @router.post("/auth/setup")
    async def setup_first_admin(
        body: SetupRequest, request: Request, response: Response
    ):
        """Create the first admin account. Rejected if any users already exist."""
        count = await db.count_users()
        if count > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Setup already completed",
            )

        try:
            user = await db.create_user(
                username=body.username.strip(),
                password_hash=hash_password(body.password),
                role="admin",
                email=body.email,
            )
        except Exception as e:
            logger.error(f"Failed to create first admin: {e}")
            raise HTTPException(status_code=400, detail="Could not create user")

        await issue_session_cookie(response, request, user)
        logger.info(f"Initial admin account created: {user['username']}")
        return {"user": _public_user(user)}

    @router.post("/auth/login")
    async def login(body: LoginRequest, request: Request, response: Response):
        """Authenticate with username/password. Sets session cookie."""
        client_ip = request.client.host if request.client else "unknown"
        await check_login_rate_limit(db, client_ip)

        user = await db.get_user_by_username(body.username.strip())
        if not user or not verify_password(
            body.password, user.get("password_hash", "")
        ):
            await record_failed_login(db, client_ip)
            raise HTTPException(status_code=401, detail="Invalid username or password")

        await clear_login_attempts(db, client_ip)
        await issue_session_cookie(response, request, user)
        return {"user": _public_user(user)}

    @router.post("/auth/logout", status_code=204)
    async def logout(response: Response):
        """Clear session cookie."""
        clear_session_cookie(response)
        return Response(status_code=204)

    # --- SSO / Keycloak Endpoints ---

    @router.get("/auth/sso/config")
    async def get_public_sso_config():
        """Public endpoint returning whether SSO is enabled."""
        cfg = await get_sso_config(db, include_secret=False)
        return {
            "enabled": cfg["enabled"],
            "provider": "keycloak",
            "name": "Keycloak",
        }

    @router.get("/auth/sso/login")
    async def sso_login(request: Request):
        """Redirect user to Keycloak login."""
        cfg = await get_sso_config(db, include_secret=True)
        if not cfg["enabled"]:
            raise HTTPException(status_code=400, detail="SSO is not enabled")
        if not cfg["server_url"] or not cfg["realm"] or not cfg["client_id"]:
            raise HTTPException(
                status_code=500, detail="Keycloak SSO is not properly configured"
            )

        # Generate state token
        state = secrets.token_urlsafe(32)
        # Store state in DB with a short TTL (10 mins)
        await db.set_app_setting(f"sso_state_{state}", str(int(datetime.now(timezone.utc).timestamp()) + 600))

        # Build redirect_uri matching callback endpoint
        # Use request's base URL / scheme / host or forward headers
        base_url = str(request.base_url).rstrip("/")
        redirect_uri = f"{base_url}/api/auth/sso/callback"

        auth_url = build_authorization_url(cfg, redirect_uri=redirect_uri, state=state)
        return RedirectResponse(url=auth_url, status_code=302)

    @router.get("/auth/sso/callback")
    async def sso_callback(
        request: Request,
        code: Optional[str] = None,
        state: Optional[str] = None,
        error: Optional[str] = None,
        error_description: Optional[str] = None,
    ):
        """Handle redirect callback from Keycloak."""
        if error:
            logger.warning(f"Keycloak returned error: {error} - {error_description}")
            return RedirectResponse(
                url=f"/login?sso_error={urllib.parse.quote(error_description or error)}",
                status_code=302,
            )

        if not code or not state:
            return RedirectResponse(
                url="/login?sso_error=Missing+code+or+state+parameter",
                status_code=302,
            )

        # Validate state
        state_key = f"sso_state_{state}"
        state_exp = await db.get_app_setting(state_key)
        if not state_exp:
            return RedirectResponse(
                url="/login?sso_error=Invalid+or+expired+SSO+state",
                status_code=302,
            )
        # Clean up consumed state
        try:
            await db.delete_app_setting(state_key)
        except Exception:
            pass

        if int(state_exp) < int(datetime.now(timezone.utc).timestamp()):
            return RedirectResponse(
                url="/login?sso_error=SSO+session+expired.+Please+try+again.",
                status_code=302,
            )

        cfg = await get_sso_config(db, include_secret=True)
        if not cfg["enabled"]:
            return RedirectResponse(
                url="/login?sso_error=SSO+is+not+enabled",
                status_code=302,
            )

        base_url = str(request.base_url).rstrip("/")
        redirect_uri = f"{base_url}/api/auth/sso/callback"

        try:
            token_data = await exchange_code_for_token(cfg, code, redirect_uri)
            access_token = token_data.get("access_token")
            if not access_token:
                raise ValueError("No access_token returned by Keycloak")

            user_info = await get_user_info(cfg, access_token)
        except Exception as e:
            logger.error(f"Failed to authenticate with Keycloak: {e}")
            return RedirectResponse(
                url=f"/login?sso_error={urllib.parse.quote(str(e))}",
                status_code=302,
            )

        sub = user_info.get("sub")
        if not sub:
            return RedirectResponse(
                url="/login?sso_error=No+sub+claim+in+user+info",
                status_code=302,
            )

        username = (
            user_info.get("preferred_username")
            or user_info.get("username")
            or user_info.get("email")
            or f"sso_{sub[:8]}"
        )
        email = user_info.get("email")

        # Extract Keycloak groups (Keycloak groups claim can be 'groups' list of strings e.g. ['/devs', '/admins'] or ['devs', 'admins'])
        raw_groups = user_info.get("groups", [])
        if isinstance(raw_groups, list):
            user_groups = set()
            for g in raw_groups:
                if isinstance(g, str):
                    clean_g = g.strip()
                    user_groups.add(clean_g)
                    user_groups.add(clean_g.lstrip("/"))
        else:
            user_groups = set()

        # Check allowed groups if configured
        allowed_groups_str = (cfg.get("allowed_groups") or "").strip()
        if allowed_groups_str:
            allowed_list = [g.strip().lstrip("/") for g in allowed_groups_str.split(",") if g.strip()]
            if allowed_list:
                # User must belong to at least one allowed group
                matches = any(ag in user_groups for ag in allowed_list)
                if not matches:
                    logger.warning(
                        f"SSO login rejected for '{username}': user groups {user_groups} do not match allowed groups {allowed_list}"
                    )
                    return RedirectResponse(
                        url=f"/login?sso_error={urllib.parse.quote('Access denied: your Keycloak account is not in an authorized group.')}",
                        status_code=302,
                    )

        # Check role and admin_group mapping:
        # Keycloak roles can be in realm_access.roles or roles
        realm_roles = []
        if isinstance(user_info.get("realm_access"), dict):
            realm_roles = user_info["realm_access"].get("roles", [])
        elif isinstance(user_info.get("roles"), list):
            realm_roles = user_info["roles"]

        admin_role_name = (cfg.get("admin_role") or "kure-admin").strip()
        admin_group_name = (cfg.get("admin_group") or "").strip().lstrip("/")

        is_admin = False
        if admin_role_name and admin_role_name in realm_roles:
            is_admin = True
        if admin_group_name and admin_group_name in user_groups:
            is_admin = True

        assigned_role = "admin" if is_admin else None

        try:
            user = await db.upsert_sso_user(
                username=username,
                email=email,
                provider="keycloak",
                sub=sub,
                role=assigned_role,
            )
        except Exception as e:
            logger.error(f"Failed to upsert SSO user in database: {e}")
            return RedirectResponse(
                url=f"/login?sso_error={urllib.parse.quote('Failed to save user account')}",
                status_code=302,
            )

        response = RedirectResponse(url="/", status_code=302)
        await issue_session_cookie(response, request, user)
        logger.info(f"SSO login successful for user '{user['username']}' (role={user['role']})")
        return response

    @router.get("/admin/sso/config")
    async def get_admin_sso_config(user: dict = Depends(require_admin)):
        """Get Keycloak SSO configuration for admin."""
        return await get_sso_config(db, include_secret=False)

    @router.post("/admin/sso/config")
    async def update_admin_sso_config(
        body: SSOSettingsRequest, user: dict = Depends(require_admin)
    ):
        """Update Keycloak SSO configuration."""
        env_cfg = await get_sso_config(db=None)
        if env_cfg.get("source") == "env":
            raise HTTPException(
                status_code=400,
                detail="SSO configuration is managed via Helm / environment variables and cannot be modified via UI.",
            )
        saved = await save_sso_config(db, body.model_dump())
        logger.info(f"Admin '{user['username']}' updated Keycloak SSO settings (enabled={saved['enabled']})")
        return saved

    @router.get("/auth/me")
    async def get_me(user: dict = Depends(require_user)):
        """Return the current authenticated user (fresh from DB) with team permissions."""
        fresh = await db.get_user_by_id(user["id"])
        if not fresh:
            raise HTTPException(status_code=401, detail="User not found")
        perms = await db.get_user_effective_permissions(fresh)
        return {"user": _public_user(fresh, perms)}

    @router.get("/auth/invitation/{token}")
    async def get_invitation(token: str):
        """Return invitation metadata if valid and unused."""
        inv = await db.get_invitation_by_token(token)
        if not inv:
            raise HTTPException(status_code=404, detail="Invitation not found")
        if inv.get("used_at"):
            raise HTTPException(status_code=410, detail="Invitation already used")
        expires_at = _parse_iso(inv.get("expires_at"))
        if expires_at and expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Invitation expired")
        return {"role": inv["role"], "expires_at": inv["expires_at"]}

    @router.post("/auth/accept-invitation")
    async def accept_invitation(
        body: AcceptInvitationRequest, request: Request, response: Response
    ):
        """Consume an invitation to create a new user account."""
        inv = await db.get_invitation_by_token(body.token)
        if not inv:
            raise HTTPException(status_code=404, detail="Invitation not found")
        if inv.get("used_at"):
            raise HTTPException(status_code=410, detail="Invitation already used")
        expires_at = _parse_iso(inv.get("expires_at"))
        if expires_at and expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Invitation expired")

        username = body.username.strip()
        existing = await db.get_user_by_username(username)
        if existing:
            raise HTTPException(status_code=409, detail="Username already taken")

        try:
            user = await db.create_user(
                username=username,
                password_hash=hash_password(body.password),
                role=inv["role"],
                email=body.email,
            )
        except Exception as e:
            logger.error(f"Failed to create user from invitation: {e}")
            raise HTTPException(status_code=400, detail="Could not create user")

        marked = await db.mark_invitation_used(inv["id"], user["id"])
        if not marked:
            # Race: someone else consumed the invitation between check and mark.
            # Roll back the user we just created so they can't log in with a
            # "used" invitation bypassed.
            await db.delete_user(user["id"])
            raise HTTPException(status_code=410, detail="Invitation already used")

        await issue_session_cookie(response, request, user)
        logger.info(
            f"User '{user['username']}' created via invitation (role={user['role']})"
        )
        return {"user": _public_user(user)}

    return router


def _parse_iso(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        s = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None
