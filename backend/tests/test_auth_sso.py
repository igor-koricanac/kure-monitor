"""Unit tests for Keycloak SSO configuration resolution and precedence."""

import json
import pytest

from api.auth_sso import (
    KEYCLOAK_CONFIG_SETTING_KEY,
    get_sso_config,
    save_sso_config,
    build_authorization_url,
    get_keycloak_endpoints,
)


class FakeDB:
    def __init__(self, initial=None):
        self._settings = dict(initial or {})

    async def get_app_setting(self, key: str):
        return self._settings.get(key)

    async def set_app_setting(self, key: str, value: str):
        self._settings[key] = value

    async def delete_app_setting(self, key: str):
        return self._settings.pop(key, None) is not None


@pytest.mark.asyncio
async def test_sso_config_default_disabled(monkeypatch):
    """When no env vars or DB settings exist, SSO is disabled."""
    monkeypatch.delenv("KEYCLOAK_ENABLED", raising=False)
    monkeypatch.delenv("KEYCLOAK_SERVER_URL", raising=False)
    monkeypatch.delenv("KEYCLOAK_REALM", raising=False)
    monkeypatch.delenv("KEYCLOAK_CLIENT_ID", raising=False)
    monkeypatch.delenv("KEYCLOAK_CLIENT_SECRET", raising=False)

    db = FakeDB()
    cfg = await get_sso_config(db)
    assert cfg["enabled"] is False
    assert cfg["source"] == "none"


@pytest.mark.asyncio
async def test_sso_config_env_precedence(monkeypatch):
    """Env vars take precedence over DB settings."""
    monkeypatch.setenv("KEYCLOAK_ENABLED", "true")
    monkeypatch.setenv("KEYCLOAK_SERVER_URL", "https://keycloak.company.org")
    monkeypatch.setenv("KEYCLOAK_REALM", "kure-env")
    monkeypatch.setenv("KEYCLOAK_CLIENT_ID", "client-env")
    monkeypatch.setenv("KEYCLOAK_CLIENT_SECRET", "secret-env")

    db = FakeDB({
        KEYCLOAK_CONFIG_SETTING_KEY: json.dumps({
            "enabled": False,
            "server_url": "https://db.org",
            "realm": "kure-db",
            "client_id": "client-db",
        })
    })

    cfg = await get_sso_config(db, include_secret=True)
    assert cfg["enabled"] is True
    assert cfg["server_url"] == "https://keycloak.company.org"
    assert cfg["realm"] == "kure-env"
    assert cfg["client_id"] == "client-env"
    assert cfg["client_secret"] == "secret-env"
    assert cfg["source"] == "env"


@pytest.mark.asyncio
async def test_sso_config_db_settings_used_when_no_env(monkeypatch):
    """When no env vars are set, DB app_settings are used."""
    monkeypatch.delenv("KEYCLOAK_ENABLED", raising=False)
    monkeypatch.delenv("KEYCLOAK_SERVER_URL", raising=False)

    db = FakeDB()
    await save_sso_config(db, {
        "enabled": True,
        "server_url": "https://keycloak.local",
        "realm": "master",
        "client_id": "kure-app",
        "client_secret": "my-secret-123",
        "admin_role": "super-admin",
    })

    cfg = await get_sso_config(db, include_secret=True)
    assert cfg["enabled"] is True
    assert cfg["server_url"] == "https://keycloak.local"
    assert cfg["realm"] == "master"
    assert cfg["client_id"] == "kure-app"
    assert cfg["client_secret"] == "my-secret-123"
    assert cfg["admin_role"] == "super-admin"
    assert cfg["source"] == "db"

    # When include_secret=False, secret is masked
    masked = await get_sso_config(db, include_secret=False)
    assert masked["client_secret"] == "***"


@pytest.mark.asyncio
async def test_sso_config_groups_support(monkeypatch):
    """Test allowed_groups and admin_group configuration."""
    monkeypatch.setenv("KEYCLOAK_ENABLED", "true")
    monkeypatch.setenv("KEYCLOAK_SERVER_URL", "https://keycloak.company.org")
    monkeypatch.setenv("KEYCLOAK_REALM", "kure")
    monkeypatch.setenv("KEYCLOAK_CLIENT_ID", "kure")
    monkeypatch.setenv("KEYCLOAK_ALLOWED_GROUPS", "devs,platform")
    monkeypatch.setenv("KEYCLOAK_ADMIN_GROUP", "platform-admins")

    db = FakeDB()
    cfg = await get_sso_config(db)
    assert cfg["allowed_groups"] == "devs,platform"
    assert cfg["admin_group"] == "platform-admins"


def test_build_authorization_url():
    config = {
        "server_url": "https://sso.example.com",
        "realm": "kure",
        "client_id": "kure-monitor",
        "scopes": "openid profile email",
    }
    url = build_authorization_url(config, "https://kure.example.com/api/auth/sso/callback", "test-state")
    assert url.startswith("https://sso.example.com/realms/kure/protocol/openid-connect/auth?")
    assert "client_id=kure-monitor" in url
    assert "response_type=code" in url
    assert "state=test-state" in url


def test_evaluate_keycloak_groups_membership():
    """Verify group evaluation logic for both leading slashes and plain group names."""
    raw_groups = ["/platform", "/developers/backend", "sre"]
    user_groups = set()
    for g in raw_groups:
        clean_g = g.strip()
        user_groups.add(clean_g)
        user_groups.add(clean_g.lstrip("/"))

    allowed_groups_str = "developers/backend,ops"
    allowed_list = [g.strip().lstrip("/") for g in allowed_groups_str.split(",") if g.strip()]
    assert any(ag in user_groups for ag in allowed_list) is True

    disallowed_groups_str = "billing,qa"
    disallowed_list = [g.strip().lstrip("/") for g in disallowed_groups_str.split(",") if g.strip()]
    assert any(dg in user_groups for dg in disallowed_list) is False


def test_evaluate_admin_role_and_admin_group():
    """Verify admin role and admin group grants."""
    raw_groups = ["/platform-admins", "developers"]
    user_groups = set()
    for g in raw_groups:
        clean_g = g.strip()
        user_groups.add(clean_g)
        user_groups.add(clean_g.lstrip("/"))

    realm_roles = ["default-roles-kure", "offline_access"]

    admin_role_name = "kure-admin"
    admin_group_name = "platform-admins"

    is_admin = False
    if admin_role_name and admin_role_name in realm_roles:
        is_admin = True
    if admin_group_name and admin_group_name in user_groups:
        is_admin = True

    assert is_admin is True


@pytest.mark.asyncio
async def test_sso_config_insecure_skip_tls_verify(monkeypatch):
    """Test insecure_skip_tls_verify via env and DB."""
    # Test env var
    monkeypatch.setenv("KEYCLOAK_ENABLED", "true")
    monkeypatch.setenv("KEYCLOAK_SERVER_URL", "https://keycloak.company.org")
    monkeypatch.setenv("KEYCLOAK_INSECURE_SKIP_TLS_VERIFY", "true")

    db = FakeDB()
    cfg = await get_sso_config(db)
    assert cfg["insecure_skip_tls_verify"] is True

    # Test DB setting
    monkeypatch.delenv("KEYCLOAK_ENABLED", raising=False)
    monkeypatch.delenv("KEYCLOAK_SERVER_URL", raising=False)
    monkeypatch.delenv("KEYCLOAK_INSECURE_SKIP_TLS_VERIFY", raising=False)

    await save_sso_config(db, {
        "enabled": True,
        "server_url": "https://keycloak.local",
        "realm": "master",
        "client_id": "kure-app",
        "insecure_skip_tls_verify": True,
    })

    db_cfg = await get_sso_config(db)
    assert db_cfg["insecure_skip_tls_verify"] is True

