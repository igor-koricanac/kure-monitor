import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AuditLogMixin:
    """Audit log storage and retention. Requires self._acquire()."""

    async def insert_audit_log(
        self,
        action: str,
        actor_username: str,
        actor_role: Optional[str] = None,
        actor_id: Optional[int] = None,
        resource_type: Optional[str] = None,
        resource_name: Optional[str] = None,
        ip_address: Optional[str] = None,
        status: str = "success",
        details: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Insert a single audit log entry."""
        async with self._acquire() as conn:
            details_json = json.dumps(details or {}, default=str)
            row = await conn.fetchrow(
                """
                INSERT INTO audit_logs (
                    actor_id, actor_username, actor_role, action,
                    resource_type, resource_name, ip_address, status, details
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
                RETURNING id
                """,
                actor_id,
                actor_username,
                actor_role,
                action,
                resource_type,
                resource_name,
                ip_address,
                status,
                details_json,
            )
            return row["id"]

    async def get_audit_logs(
        self,
        action: Optional[str] = None,
        actor: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """Query audit logs with optional filters and pagination."""
        async with self._acquire() as conn:
            clauses = []
            params: List[Any] = []
            idx = 1

            if action:
                clauses.append(f"action = ${idx}")
                params.append(action)
                idx += 1

            if actor:
                clauses.append(f"actor_username ILIKE ${idx}")
                params.append(f"%{actor}%")
                idx += 1

            if search:
                clauses.append(
                    f"(actor_username ILIKE ${idx} OR action ILIKE ${idx} "
                    f"OR COALESCE(resource_name, '') ILIKE ${idx} "
                    f"OR COALESCE(resource_type, '') ILIKE ${idx})"
                )
                params.append(f"%{search}%")
                idx += 1

            where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM audit_logs {where_sql}", *params
            )

            rows = await conn.fetch(
                f"""
                SELECT id, created_at, actor_id, actor_username, actor_role,
                       action, resource_type, resource_name, ip_address, status, details
                FROM audit_logs
                {where_sql}
                ORDER BY created_at DESC, id DESC
                LIMIT ${idx} OFFSET ${idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            items = []
            for r in rows:
                raw_details = r["details"]
                if isinstance(raw_details, str):
                    try:
                        parsed_details = json.loads(raw_details)
                    except Exception:
                        parsed_details = {}
                else:
                    parsed_details = raw_details or {}

                items.append(
                    {
                        "id": r["id"],
                        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                        "actor_id": r["actor_id"],
                        "actor_username": r["actor_username"],
                        "actor_role": r["actor_role"],
                        "action": r["action"],
                        "resource_type": r["resource_type"],
                        "resource_name": r["resource_name"],
                        "ip_address": r["ip_address"],
                        "status": r["status"],
                        "details": parsed_details,
                    }
                )

            return {"items": items, "total": int(total or 0)}

    async def prune_audit_logs(self, retention_days: int = 90) -> int:
        """Delete audit log rows older than retention_days (leader-guarded)."""
        async with self._acquire() as conn:
            async with conn.transaction():
                acquired = await conn.fetchval(
                    "SELECT pg_try_advisory_xact_lock(75013902)"
                )
                if not acquired:
                    return 0
                result = await conn.execute(
                    """
                    DELETE FROM audit_logs
                    WHERE created_at < NOW() - make_interval(days => $1)
                    """,
                    retention_days,
                )
                try:
                    return int(result.split()[-1])
                except Exception:
                    return 0
