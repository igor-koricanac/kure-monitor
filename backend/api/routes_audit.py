import csv
import io
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .auth import require_admin
from .deps import RouterDeps

logger = logging.getLogger(__name__)

AUDIT_RETENTION_KEY = "audit_log_retention_days"


def get_default_audit_retention_days() -> int:
    try:
        val = int(os.getenv("AUDIT_LOG_RETENTION_DAYS", "90"))
        return max(7, min(3650, val))
    except (ValueError, TypeError):
        return 90


class AuditRetentionUpdate(BaseModel):
    retention_days: int = Field(..., ge=7, le=3650)


def create_audit_router(deps: RouterDeps) -> APIRouter:
    """Admin-only Audit Log API routes."""
    router = APIRouter(dependencies=[Depends(require_admin)])
    db = deps.db

    @router.get("/admin/audit-logs")
    async def list_audit_logs(
        action: Optional[str] = Query(None),
        actor: Optional[str] = Query(None),
        search: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        """List audit log entries (Admin only)."""
        try:
            return await db.get_audit_logs(
                action=action or None,
                actor=actor or None,
                search=search or None,
                limit=limit,
                offset=offset,
            )
        except Exception as e:
            logger.error(f"Error listing audit logs: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/admin/audit-logs/export")
    async def export_audit_logs(
        format: str = Query("csv", pattern="^(csv|json)$"),
        action: Optional[str] = Query(None),
        actor: Optional[str] = Query(None),
        search: Optional[str] = Query(None),
    ):
        """Export audit logs as CSV or JSON (Admin only)."""
        try:
            data = await db.get_audit_logs(
                action=action or None,
                actor=actor or None,
                search=search or None,
                limit=5000,
                offset=0,
            )
            items = data.get("items", [])
            if format == "json":
                return Response(
                    content=json.dumps(items, indent=2, default=str),
                    media_type="application/json",
                    headers={
                        "Content-Disposition": 'attachment; filename="kure-audit-logs.json"'
                    },
                )

            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(
                [
                    "id",
                    "created_at",
                    "actor_username",
                    "actor_role",
                    "action",
                    "resource_type",
                    "resource_name",
                    "status",
                    "ip_address",
                    "details",
                ]
            )
            for item in items:
                writer.writerow(
                    [
                        item.get("id"),
                        item.get("created_at"),
                        item.get("actor_username"),
                        item.get("actor_role") or "",
                        item.get("action"),
                        item.get("resource_type") or "",
                        item.get("resource_name") or "",
                        item.get("status"),
                        item.get("ip_address") or "",
                        json.dumps(item.get("details") or {}, default=str),
                    ]
                )
            return Response(
                content=buf.getvalue(),
                media_type="text/csv",
                headers={
                    "Content-Disposition": 'attachment; filename="kure-audit-logs.csv"'
                },
            )
        except Exception as e:
            logger.error(f"Error exporting audit logs: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")

    @router.get("/admin/audit-logs/retention")
    async def get_audit_retention():
        """Get audit log retention period in days (Admin only)."""
        try:
            raw = await db.get_app_setting(AUDIT_RETENTION_KEY)
            days = int(raw) if raw is not None else get_default_audit_retention_days()
            return {"retention_days": days}
        except Exception as e:
            logger.error(f"Error getting audit retention: {e}")
            return {"retention_days": get_default_audit_retention_days()}

    @router.put("/admin/audit-logs/retention")
    async def update_audit_retention(body: AuditRetentionUpdate):
        """Update audit log retention period in days (Admin only)."""
        try:
            await db.set_app_setting(AUDIT_RETENTION_KEY, str(body.retention_days))
            return {"retention_days": body.retention_days}
        except Exception as e:
            logger.error(f"Error updating audit retention: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")

    return router
