from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import json
import logging
from typing import List, Optional
from api.auth import SESSION_COOKIE_NAME, validate_ws_auth
from models.models import PodFailureResponse, SecurityFindingResponse
from services.prometheus_metrics import WEBSOCKET_CONNECTIONS_ACTIVE

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.connection_principals: dict[WebSocket, dict] = {}
        self.router = APIRouter()
        self.router.websocket("/ws")(self.websocket_endpoint)

    async def connect(self, websocket: WebSocket, principal: Optional[dict] = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if principal is not None:
            self.connection_principals[websocket] = principal
        WEBSOCKET_CONNECTIONS_ACTIVE.inc()
        logger.info(
            f"WebSocket connected. Total connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            WEBSOCKET_CONNECTIONS_ACTIVE.dec()
        self.connection_principals.pop(websocket, None)
        logger.info(
            f"WebSocket disconnected. Total connections: {len(self.active_connections)}"
        )

    async def _can_receive_namespace(self, connection: WebSocket, namespace: Optional[str]) -> bool:
        """Check if a connected WebSocket client is permitted to receive events for a namespace."""
        if not namespace:
            return True
        principal = self.connection_principals.get(connection)
        if not principal or principal.get("kind") == "service" or principal.get("role") == "admin":
            return True
        db = getattr(getattr(connection, "app", None), "state", None)
        db = getattr(db, "db", None) if db else None
        if not db or not hasattr(db, "get_user_effective_permissions"):
            return True
        try:
            perms = await db.get_user_effective_permissions(principal)
            if perms.get("all_namespaces"):
                return True
            allowed_ns = set(perms.get("namespaces", []))
            return namespace in allowed_ns
        except Exception as e:
            logger.warning(f"Failed to check WS namespace permissions: {e}")
            return False

    async def _broadcast(
        self, message_type: str, data, description: str = None, parallel: bool = False
    ):
        """Generic broadcast to all connected WebSocket clients.

        Args:
            message_type: The message type string sent to clients.
            data: The payload (dict, list, or Pydantic model with .model_dump()).
            description: Human-readable label for log messages. Defaults to message_type.
            parallel: If True, send to all clients concurrently with timeouts.
        """
        if not self.active_connections:
            return

        desc = description or message_type

        if hasattr(data, "model_dump"):
            data = data.model_dump()

        namespace = None
        if isinstance(data, dict):
            namespace = data.get("namespace") or (
                data.get("scope", {}).get("namespace")
                if isinstance(data.get("scope"), dict)
                else None
            )

        if parallel:
            serialized = json.dumps({"type": message_type, "data": data}, default=str)

            async def send_to_client(connection):
                try:
                    if not await self._can_receive_namespace(connection, namespace):
                        return True, connection
                    await asyncio.wait_for(
                        connection.send_text(serialized), timeout=10.0
                    )
                    return True, connection
                except asyncio.TimeoutError:
                    logger.warning(f"Timeout sending {desc} to WebSocket client")
                    return False, connection
                except Exception as e:
                    logger.warning(f"Failed to send {desc} to WebSocket: {e}")
                    return False, connection

            results = await asyncio.gather(
                *[send_to_client(conn) for conn in self.active_connections],
                return_exceptions=True,
            )

            disconnected = []
            for result in results:
                if isinstance(result, tuple):
                    success, conn = result
                    if not success:
                        disconnected.append(conn)
        else:
            message = {"type": message_type, "data": data}
            serialized = json.dumps(message, default=str)
            disconnected = []
            for connection in list(self.active_connections):
                try:
                    if not await self._can_receive_namespace(connection, namespace):
                        continue
                    await connection.send_text(serialized)
                except Exception as e:
                    logger.warning(f"Failed to send {desc} to WebSocket: {e}")
                    disconnected.append(connection)

        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
            self.connection_principals.pop(conn, None)

    # --- Pod broadcasts ---

    async def broadcast_pod_failure(self, failure: PodFailureResponse):
        """Broadcast new pod failure to all connected clients"""
        await self._broadcast("pod_failure", failure)

    async def broadcast_pod_deleted(self, namespace: str, pod_name: str):
        """Broadcast pod deletion to all connected clients"""
        await self._broadcast(
            "pod_deleted", {"namespace": namespace, "pod_name": pod_name}
        )

    async def broadcast_pod_solution_updated(self, pod_failure: PodFailureResponse):
        """Broadcast pod solution update to all connected clients"""
        await self._broadcast("pod_solution_updated", pod_failure)

    async def broadcast_pod_status_change(self, pod_failure: PodFailureResponse):
        """Broadcast pod status change to all connected clients"""
        await self._broadcast("pod_status_change", pod_failure)

    async def broadcast_pod_troubleshoot_updated(
        self,
        pod_id: int,
        solution: str,
        generated_at: Optional[str],
        namespace: Optional[str] = None,
    ):
        """Broadcast log-aware troubleshoot solution update to all connected clients"""
        payload = {
            "pod_id": pod_id,
            "solution": solution,
            "generated_at": generated_at,
        }
        if namespace:
            payload["namespace"] = namespace
        await self._broadcast("pod_troubleshoot_updated", payload)

    # --- Security broadcasts ---

    async def broadcast_security_finding(self, finding: SecurityFindingResponse):
        """Broadcast new security finding to all connected clients"""
        await self._broadcast("security_finding", finding)

    async def broadcast_security_finding_deleted(self, finding_data: dict):
        """Broadcast security finding deletion to all connected clients"""
        await self._broadcast("security_finding_deleted", finding_data)

    async def broadcast_security_rescan_status(self, status: str, reason: str = None):
        """Broadcast security rescan status to all connected clients (started/completed)"""
        logger.info(
            f"Broadcasting security rescan status: {status} (reason: {reason}) to {len(self.active_connections)} clients"
        )
        await self._broadcast(
            "security_rescan_status", {"status": status, "reason": reason}
        )

    # --- Admin/exclusion broadcasts ---

    async def broadcast_namespace_exclusion_change(self, namespace: str, action: str):
        """Broadcast namespace exclusion change to all connected clients (including scanners)"""
        await self._broadcast(
            "namespace_exclusion_change", {"namespace": namespace, "action": action}
        )

    async def broadcast_pod_exclusion_change(self, pod_name: str, action: str):
        """Broadcast pod exclusion change to all connected clients (including agent)"""
        await self._broadcast(
            "pod_exclusion_change", {"pod_name": pod_name, "action": action}
        )

    async def broadcast_rule_exclusion_change(
        self, rule_title: str, action: str, namespace: str = None
    ):
        """Broadcast rule exclusion change to all connected clients (including scanners)"""
        await self._broadcast(
            "rule_exclusion_change",
            {"rule_title": rule_title, "namespace": namespace, "action": action},
        )

    async def broadcast_trusted_registry_change(self, registry: str, action: str):
        """Broadcast trusted registry change to all connected clients (including scanners)"""
        logger.info(
            f"Broadcasting trusted registry change: {registry} -> {action} to {len(self.active_connections)} clients"
        )
        await self._broadcast(
            "trusted_registry_change",
            {"registry": registry, "action": action},
            description="trusted registry change",
            parallel=True,
        )

    async def broadcast_security_rescan_request(self):
        """Broadcast a security rescan request to all connected clients (scanner picks this up)"""
        logger.info(
            f"Broadcasting security rescan request to {len(self.active_connections)} clients"
        )
        await self._broadcast("security_rescan_request", {})

    # --- AI Advice broadcasts ---

    async def broadcast_advice_finding(self, finding):
        """Broadcast a new (or refreshed) AI Advice finding to all clients.

        ``finding`` may be an :class:`AdviceFinding` Pydantic model or a
        plain dict (e.g. the wire-form returned by save_advice_finding).
        """
        await self._broadcast("advice_finding", finding)

    async def broadcast_advice_finding_deleted(self, finding_data: dict):
        """Broadcast an AI Advice finding deletion/dismissal."""
        await self._broadcast("advice_finding_deleted", finding_data)

    async def broadcast_advice_scan_status(
        self, status: str, scope: dict, scan_id: str = None
    ):
        """Broadcast scan progress for the AI Advice subsystem.

        ``status`` is one of ``started``/``completed``/``failed``;
        ``scope`` echoes the request body so clients can correlate.
        """
        payload = {"status": status, "scope": scope, "scan_id": scan_id}
        await self._broadcast("advice_scan_status", payload)

    # --- Mirror pod broadcasts ---

    async def broadcast_mirror_event(self, event_type: str, data: dict):
        """Broadcast mirror pod events (mirror_created, mirror_deleted, mirror_status_change)"""
        await self._broadcast(
            event_type, data, description=f"mirror event: {event_type}"
        )

    # --- WebSocket endpoint ---

    async def websocket_endpoint(self, websocket: WebSocket):
        """Authenticate WebSocket via user session cookie OR service token.

        - Frontend: connects with the `kure_session` httpOnly cookie.
        - Agent / scanner: connects with the `X-Service-Token` header
          (preferred) or, for backwards compatibility, `?token=<service_token>`.
          The header form avoids tokens landing in proxy/access logs.
        """
        db = getattr(websocket.app.state, "db", None)
        if db is None:
            await websocket.close(code=1011, reason="Server not ready")
            return

        cookie_token = websocket.cookies.get(SESSION_COOKIE_NAME)
        # Prefer header; fall back to query param for legacy clients.
        header_token = websocket.headers.get("x-service-token")
        query_token = header_token or websocket.query_params.get("token")

        principal = await validate_ws_auth(
            cookie_token=cookie_token,
            query_token=query_token,
            db=db,
        )
        if not principal:
            await websocket.close(code=4001, reason="Unauthorized")
            return

        await self.connect(websocket, principal=principal)
        try:
            while True:
                # Keep connection alive
                await websocket.receive_text()
        except WebSocketDisconnect:
            self.disconnect(websocket)
