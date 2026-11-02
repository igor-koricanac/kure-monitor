import pytest
from unittest.mock import AsyncMock, Mock
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from api.routes import create_api_router
from api.auth import require_authenticated
from models.models import PodFailureResponse, SecurityFindingResponse
from services.solution_engine import SolutionEngine
from services.websocket import WebSocketManager


def _make_pod(id: int, pod_name: str, namespace: str, status: str = "new", failure_reason: str = "CrashLoopBackOff") -> PodFailureResponse:
    return PodFailureResponse(
        id=id,
        pod_name=pod_name,
        namespace=namespace,
        node_name="node-1",
        phase="Running",
        creation_timestamp="2026-01-01T00:00:00Z",
        failure_reason=failure_reason,
        failure_message="Failed",
        container_statuses=[],
        events=[],
        logs="",
        manifest="apiVersion: v1\nkind: Pod",
        solution="Fix it",
        timestamp="2026-01-01T00:00:00Z",
        status=status,
    )


def _make_finding(id: int, resource_name: str, namespace: str) -> SecurityFindingResponse:
    return SecurityFindingResponse(
        id=id,
        resource_type="Pod",
        resource_name=resource_name,
        namespace=namespace,
        severity="high",
        category="Security",
        title="Privileged container",
        description="Container runs privileged",
        remediation="Set privileged: false",
        manifest="apiVersion: v1\nkind: Pod\nmetadata:\n  name: " + resource_name,
        timestamp="2026-01-01T00:00:00Z",
    )


@pytest.mark.asyncio
async def test_websocket_broadcast_filters_by_namespace():
    """WebSocketManager._broadcast should only send namespace-scoped events to permitted users."""
    ws_manager = WebSocketManager()

    mock_db = Mock()

    async def fake_perms(user):
        if user["id"] == 2:
            return {
                "role": "member",
                "has_team": True,
                "access_level": "read",
                "all_namespaces": False,
                "namespaces": ["team-a"],
                "tabs": ["pod_monitoring"],
            }
        if user["id"] == 3:
            return {
                "role": "member",
                "has_team": True,
                "access_level": "read",
                "all_namespaces": True,
                "namespaces": [],
                "tabs": ["pod_monitoring"],
            }
        return {"all_namespaces": False, "namespaces": []}

    mock_db.get_user_effective_permissions = AsyncMock(side_effect=fake_perms)

    fake_app = FastAPI()
    fake_app.state.db = mock_db

    def make_ws():
        ws = AsyncMock()
        ws.app = fake_app
        return ws

    ws_admin = make_ws()
    ws_team_a = make_ws()
    ws_all_ns = make_ws()
    ws_service = make_ws()

    await ws_manager.connect(ws_admin, principal={"kind": "user", "id": 1, "username": "admin", "role": "admin"})
    await ws_manager.connect(ws_team_a, principal={"kind": "user", "id": 2, "username": "alice", "role": "member"})
    await ws_manager.connect(ws_all_ns, principal={"kind": "user", "id": 3, "username": "bob", "role": "member"})
    await ws_manager.connect(ws_service, principal={"kind": "service"})

    # Broadcast pod failure in 'team-b' (restricted from alice)
    pod_team_b = _make_pod(1, "pod-b", "team-b")
    await ws_manager.broadcast_pod_failure(pod_team_b)

    assert ws_admin.send_text.call_count == 1
    assert ws_all_ns.send_text.call_count == 1
    assert ws_service.send_text.call_count == 1
    assert ws_team_a.send_text.call_count == 0

    # Broadcast pod failure in 'team-a' (allowed for alice)
    pod_team_a = _make_pod(2, "pod-a", "team-a")
    await ws_manager.broadcast_pod_failure(pod_team_a)

    assert ws_admin.send_text.call_count == 2
    assert ws_all_ns.send_text.call_count == 2
    assert ws_service.send_text.call_count == 2
    assert ws_team_a.send_text.call_count == 1

    # Broadcast status change in 'team-b' -> alice should not receive
    await ws_manager.broadcast_pod_status_change(pod_team_b)
    assert ws_team_a.send_text.call_count == 1

    # Broadcast solution update in 'team-b' -> alice should not receive
    await ws_manager.broadcast_pod_solution_updated(pod_team_b)
    assert ws_team_a.send_text.call_count == 1


@pytest.mark.asyncio
async def test_pod_actions_namespace_restrictions():
    """get_failed_pods and write/action endpoints must enforce user's allowed namespaces."""
    mock_db = Mock()

    pod_allowed = _make_pod(10, "allowed-pod", "team-a", status="new")
    pod_forbidden = _make_pod(20, "secret-pod", "team-b", status="new")

    mock_db.get_pod_failures = AsyncMock(return_value=[pod_allowed, pod_forbidden])

    async def get_by_id(pod_id: int):
        for p in (pod_allowed, pod_forbidden):
            if p.id == pod_id:
                return p
        return None

    mock_db.get_pod_failure_by_id = AsyncMock(side_effect=get_by_id)
    mock_db.update_pod_status = AsyncMock(side_effect=lambda pid, st, *a: _make_pod(pid, "pod", "team-a", status=st))
    mock_db.update_pod_solution = AsyncMock()
    mock_db.get_pod_failure_logs = AsyncMock(return_value=[{"container_name": "app", "logs": "crash"}])
    mock_db.update_pod_troubleshoot_solution = AsyncMock(return_value="2026-01-01T00:05:00Z")
    mock_db.dismiss_pod_failure = AsyncMock()

    mock_db.get_user_effective_permissions = AsyncMock(
        return_value={
            "role": "member",
            "has_team": True,
            "access_level": "write",
            "all_namespaces": False,
            "namespaces": ["team-a"],
            "tabs": ["pod_monitoring"],
        }
    )

    mock_solution_engine = Mock(spec=SolutionEngine)
    mock_solution_engine.get_solution = AsyncMock(return_value="New AI solution")
    mock_solution_engine.get_log_aware_solution = AsyncMock(return_value="Log aware solution")
    mock_solution_engine.llm_provider = None

    ws_manager = WebSocketManager()

    app = FastAPI()
    app.state.db = mock_db

    from fastapi import Request

    async def fake_member_auth(request: Request):
        user = {"id": 2, "username": "alice", "role": "member"}
        request.state.user = user
        return user

    app.dependency_overrides[require_authenticated] = fake_member_auth

    api_router = create_api_router(
        db=mock_db,
        solution_engine=mock_solution_engine,
        websocket_manager=ws_manager,
    )
    app.include_router(api_router)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. GET /api/pods/failed filters out team-b
        r = await client.get("/api/pods/failed")
        assert r.status_code == 200
        failed = r.json()
        assert len(failed) == 1
        assert failed[0]["namespace"] == "team-a"

        # 2. POST /api/pods/failed/{pod_id}/retry-solution blocked on team-b (403), allowed on team-a (200)
        r_retry_forbidden = await client.post("/api/pods/failed/20/retry-solution")
        assert r_retry_forbidden.status_code == 403

        r_retry_allowed = await client.post("/api/pods/failed/10/retry-solution")
        assert r_retry_allowed.status_code == 200

        # 3. POST /api/pods/failed/{pod_id}/troubleshoot blocked on team-b (403), allowed on team-a (200)
        r_ts_forbidden = await client.post("/api/pods/failed/20/troubleshoot")
        assert r_ts_forbidden.status_code == 403

        r_ts_allowed = await client.post("/api/pods/failed/10/troubleshoot")
        assert r_ts_allowed.status_code == 200

        # 4. DELETE /api/pods/failed/{pod_id} (dismiss) blocked on team-b (403), allowed on team-a (200)
        r_dis_forbidden = await client.delete("/api/pods/failed/20")
        assert r_dis_forbidden.status_code == 403

        r_dis_allowed = await client.delete("/api/pods/failed/10")
        assert r_dis_allowed.status_code == 200


@pytest.mark.asyncio
async def test_security_findings_namespace_restrictions():
    """Single-finding endpoints (manifest, fix, dismiss, restore) must enforce user's allowed namespaces."""
    mock_db = Mock()

    finding_allowed = _make_finding(100, "allowed-pod", "team-a")
    finding_forbidden = _make_finding(200, "secret-pod", "team-b")

    async def get_finding_by_id(finding_id: int):
        for f in (finding_allowed, finding_forbidden):
            if f.id == finding_id:
                return f
        return None

    mock_db.get_security_finding_by_id = AsyncMock(side_effect=get_finding_by_id)
    mock_db.dismiss_security_finding = AsyncMock()
    mock_db.restore_security_finding = AsyncMock()

    mock_db.get_user_effective_permissions = AsyncMock(
        return_value={
            "role": "member",
            "has_team": True,
            "access_level": "write",
            "all_namespaces": False,
            "namespaces": ["team-a"],
            "tabs": ["security_scanner"],
        }
    )

    mock_solution_engine = Mock(spec=SolutionEngine)
    mock_solution_engine.generate_security_fix = AsyncMock(
        return_value={
            "fixed_manifest": "apiVersion: v1\nkind: Pod\nmetadata:\n  name: allowed-pod\nspec:\n  securityContext:\n    runAsNonRoot: true",
            "explanation": "Added runAsNonRoot",
            "is_fallback": False,
        }
    )
    mock_solution_engine.llm_provider = None

    ws_manager = WebSocketManager()

    app = FastAPI()
    app.state.db = mock_db

    from fastapi import Request

    async def fake_member_auth(request: Request):
        user = {"id": 2, "username": "alice", "role": "member"}
        request.state.user = user
        return user

    app.dependency_overrides[require_authenticated] = fake_member_auth

    api_router = create_api_router(
        db=mock_db,
        solution_engine=mock_solution_engine,
        websocket_manager=ws_manager,
    )
    app.include_router(api_router)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. GET /api/security/findings/{id}/manifest blocked on team-b (403), allowed on team-a (200)
        r_man_forbidden = await client.get("/api/security/findings/200/manifest")
        assert r_man_forbidden.status_code == 403

        r_man_allowed = await client.get("/api/security/findings/100/manifest")
        assert r_man_allowed.status_code == 200
        assert r_man_allowed.json()["namespace"] == "team-a"

        # 2. POST /api/security/findings/{id}/fix blocked on team-b (403), allowed on team-a (200)
        r_fix_forbidden = await client.post("/api/security/findings/200/fix")
        assert r_fix_forbidden.status_code == 403

        r_fix_allowed = await client.post("/api/security/findings/100/fix")
        assert r_fix_allowed.status_code == 200
        assert r_fix_allowed.json()["finding_id"] == 100

        # 3. DELETE /api/security/findings/{id} blocked on team-b (403), allowed on team-a (200)
        r_del_forbidden = await client.delete("/api/security/findings/200")
        assert r_del_forbidden.status_code == 403

        r_del_allowed = await client.delete("/api/security/findings/100")
        assert r_del_allowed.status_code == 200

        # 4. PUT /api/security/findings/{id}/restore blocked on team-b (403), allowed on team-a (200)
        r_res_forbidden = await client.put("/api/security/findings/200/restore")
        assert r_res_forbidden.status_code == 403

        r_res_allowed = await client.put("/api/security/findings/100/restore")
        assert r_res_allowed.status_code == 200
