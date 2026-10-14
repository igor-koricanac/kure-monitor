"""Admin-only team management routes."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import require_admin
from .deps import RouterDeps

logger = logging.getLogger(__name__)


class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    description: Optional[str] = Field(None, max_length=500)
    access_level: str = Field("read", description="One of 'read', 'write'")
    all_namespaces: bool = Field(False)
    tabs: List[str] = Field(default_factory=list)
    namespaces: List[str] = Field(default_factory=list)
    member_ids: List[int] = Field(default_factory=list)


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=64)
    description: Optional[str] = Field(None, max_length=500)
    access_level: Optional[str] = Field(None, description="One of 'read', 'write'")
    all_namespaces: Optional[bool] = None
    tabs: Optional[List[str]] = None
    namespaces: Optional[List[str]] = None


class AddMemberRequest(BaseModel):
    user_id: int


def create_teams_router(deps: RouterDeps) -> APIRouter:
    """Admin-only team management routes."""
    router = APIRouter(dependencies=[Depends(require_admin)])
    db = deps.db

    @router.get("/admin/cluster-namespaces")
    async def list_cluster_namespaces() -> List[str]:
        """List all live namespaces from the Kubernetes cluster for team assignments.
        Falls back to database namespaces if the cluster API is unreachable."""
        topology_svc = getattr(deps, "topology_service", None)
        if topology_svc:
            try:
                namespaces = await topology_svc.list_namespaces(include_default=True)
                if namespaces:
                    return namespaces
            except Exception as e:
                logger.warning(f"Failed to fetch cluster namespaces via topology service: {e}")

        # Fallback to DB
        try:
            return await db.get_all_namespaces()
        except Exception as e:
            logger.error(f"Failed to fetch namespaces from database fallback: {e}")
            return []

    @router.get("/admin/teams")
    async def list_teams():
        """List all teams with member metadata, tabs, namespaces, and access level."""
        return await db.list_teams()

    @router.post("/admin/teams")
    async def create_team(body: CreateTeamRequest):
        """Create a new team."""
        if body.access_level not in ("read", "write"):
            raise HTTPException(status_code=400, detail="access_level must be 'read' or 'write'")

        existing = await db.get_team_by_name(body.name.strip())
        if existing:
            raise HTTPException(status_code=409, detail="Team with this name already exists")

        try:
            team = await db.create_team(
                name=body.name,
                description=body.description,
                access_level=body.access_level,
                all_namespaces=body.all_namespaces,
                tabs=body.tabs,
                namespaces=body.namespaces,
                member_ids=body.member_ids,
            )
            return team
        except Exception as e:
            logger.error(f"Failed to create team: {e}")
            raise HTTPException(status_code=400, detail="Failed to create team")

    @router.get("/admin/teams/{team_id}")
    async def get_team(team_id: int):
        """Get single team details."""
        team = await db.get_team_by_id(team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        return team

    @router.put("/admin/teams/{team_id}")
    async def update_team(team_id: int, body: UpdateTeamRequest):
        """Update team attributes, tabs, and namespaces."""
        if body.access_level is not None and body.access_level not in ("read", "write"):
            raise HTTPException(status_code=400, detail="access_level must be 'read' or 'write'")

        if body.name is not None:
            existing = await db.get_team_by_name(body.name.strip())
            if existing and existing["id"] != team_id:
                raise HTTPException(status_code=409, detail="Team with this name already exists")

        updated = await db.update_team(
            team_id=team_id,
            name=body.name,
            description=body.description,
            access_level=body.access_level,
            all_namespaces=body.all_namespaces,
            tabs=body.tabs,
            namespaces=body.namespaces,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Team not found")
        return updated

    @router.delete("/admin/teams/{team_id}")
    async def delete_team(team_id: int):
        """Delete a team."""
        deleted = await db.delete_team(team_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Team not found")
        return {"message": "Team deleted"}

    @router.post("/admin/teams/{team_id}/members")
    async def add_team_member(team_id: int, body: AddMemberRequest):
        """Add a member to a team."""
        team = await db.get_team_by_id(team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        user = await db.get_user_by_id(body.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        await db.add_team_member(team_id, body.user_id)
        return await db.get_team_by_id(team_id)

    @router.delete("/admin/teams/{team_id}/members/{user_id}")
    async def remove_team_member(team_id: int, user_id: int):
        """Remove a member from a team."""
        team = await db.get_team_by_id(team_id)
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")

        removed = await db.remove_team_member(team_id, user_id)
        if not removed:
            raise HTTPException(status_code=404, detail="Member not in team")
        return {"message": "Member removed"}

    return router
