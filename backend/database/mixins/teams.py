"""Teams and RBAC database operations."""
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

VALID_TABS = {"pod_monitoring", "security_scanner", "diagram", "ai_advice"}


class TeamMixin:
    """Team and team permission management. Requires self._acquire()."""

    async def list_teams(self) -> List[Dict[str, Any]]:
        """List all teams with member counts, tabs, namespaces, and access level."""
        async with self._acquire() as conn:
            teams = await conn.fetch(
                """
                SELECT id, name, description, access_level, all_namespaces, created_at, updated_at
                FROM teams ORDER BY name ASC
                """
            )
            result = []
            for t in teams:
                team_id = t["id"]
                tabs = await conn.fetch(
                    "SELECT tab FROM team_tabs WHERE team_id = $1 ORDER BY tab ASC",
                    team_id,
                )
                namespaces = await conn.fetch(
                    "SELECT namespace FROM team_namespaces WHERE team_id = $1 ORDER BY namespace ASC",
                    team_id,
                )
                members = await conn.fetch(
                    """
                    SELECT u.id, u.username, u.email, u.role
                    FROM team_members tm
                    JOIN users u ON u.id = tm.user_id
                    WHERE tm.team_id = $1
                    ORDER BY u.username ASC
                    """,
                    team_id,
                )
                result.append(
                    {
                        "id": t["id"],
                        "name": t["name"],
                        "description": t["description"],
                        "access_level": t["access_level"],
                        "all_namespaces": t["all_namespaces"],
                        "tabs": [row["tab"] for row in tabs],
                        "namespaces": [row["namespace"] for row in namespaces],
                        "members": [
                            {
                                "id": m["id"],
                                "username": m["username"],
                                "email": m["email"],
                                "role": m["role"],
                            }
                            for m in members
                        ],
                        "created_at": t["created_at"].isoformat() if t["created_at"] else None,
                        "updated_at": t["updated_at"].isoformat() if t["updated_at"] else None,
                    }
                )
            return result

    async def get_team_by_id(self, team_id: int) -> Optional[Dict[str, Any]]:
        """Get single team by ID with members, tabs, and namespaces."""
        async with self._acquire() as conn:
            t = await conn.fetchrow(
                """
                SELECT id, name, description, access_level, all_namespaces, created_at, updated_at
                FROM teams WHERE id = $1
                """,
                team_id,
            )
            if not t:
                return None

            tabs = await conn.fetch(
                "SELECT tab FROM team_tabs WHERE team_id = $1 ORDER BY tab ASC",
                team_id,
            )
            namespaces = await conn.fetch(
                "SELECT namespace FROM team_namespaces WHERE team_id = $1 ORDER BY namespace ASC",
                team_id,
            )
            members = await conn.fetch(
                """
                SELECT u.id, u.username, u.email, u.role
                FROM team_members tm
                JOIN users u ON u.id = tm.user_id
                WHERE tm.team_id = $1
                ORDER BY u.username ASC
                """,
                team_id,
            )
            return {
                "id": t["id"],
                "name": t["name"],
                "description": t["description"],
                "access_level": t["access_level"],
                "all_namespaces": t["all_namespaces"],
                "tabs": [row["tab"] for row in tabs],
                "namespaces": [row["namespace"] for row in namespaces],
                "members": [
                    {
                        "id": m["id"],
                        "username": m["username"],
                        "email": m["email"],
                        "role": m["role"],
                    }
                    for m in members
                ],
                "created_at": t["created_at"].isoformat() if t["created_at"] else None,
                "updated_at": t["updated_at"].isoformat() if t["updated_at"] else None,
            }

    async def get_team_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get single team by name."""
        async with self._acquire() as conn:
            row = await conn.fetchrow("SELECT id FROM teams WHERE name = $1", name)
            if not row:
                return None
            return await self.get_team_by_id(row["id"])

    async def create_team(
        self,
        name: str,
        description: Optional[str] = None,
        access_level: str = "read",
        all_namespaces: bool = False,
        tabs: Optional[List[str]] = None,
        namespaces: Optional[List[str]] = None,
        member_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Create a new team."""
        if access_level not in ("read", "write"):
            raise ValueError("access_level must be 'read' or 'write'")

        clean_tabs = [t for t in (tabs or []) if t in VALID_TABS]

        async with self._acquire() as conn:
            async with conn.transaction():
                team_row = await conn.fetchrow(
                    """
                    INSERT INTO teams (name, description, access_level, all_namespaces)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id
                    """,
                    name.strip(),
                    description.strip() if description else None,
                    access_level,
                    all_namespaces,
                )
                team_id = team_row["id"]

                for tab in clean_tabs:
                    await conn.execute(
                        "INSERT INTO team_tabs (team_id, tab) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        team_id,
                        tab,
                    )

                if not all_namespaces and namespaces:
                    for ns in namespaces:
                        ns_clean = ns.strip()
                        if ns_clean:
                            await conn.execute(
                                "INSERT INTO team_namespaces (team_id, namespace) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                                team_id,
                                ns_clean,
                            )

                if member_ids:
                    for uid in member_ids:
                        await conn.execute(
                            "INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                            team_id,
                            uid,
                        )

        return await self.get_team_by_id(team_id)

    async def update_team(
        self,
        team_id: int,
        name: Optional[str] = None,
        description: Optional[str] = None,
        access_level: Optional[str] = None,
        all_namespaces: Optional[bool] = None,
        tabs: Optional[List[str]] = None,
        namespaces: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update team attributes, tabs, and namespaces."""
        if access_level is not None and access_level not in ("read", "write"):
            raise ValueError("access_level must be 'read' or 'write'")

        async with self._acquire() as conn:
            async with conn.transaction():
                existing = await conn.fetchrow("SELECT id FROM teams WHERE id = $1", team_id)
                if not existing:
                    return None

                updates = []
                args = []
                if name is not None:
                    args.append(name.strip())
                    updates.append(f"name = ${len(args)}")
                if description is not None:
                    args.append(description.strip() if description else None)
                    updates.append(f"description = ${len(args)}")
                if access_level is not None:
                    args.append(access_level)
                    updates.append(f"access_level = ${len(args)}")
                if all_namespaces is not None:
                    args.append(all_namespaces)
                    updates.append(f"all_namespaces = ${len(args)}")

                if updates:
                    args.append(team_id)
                    query = f"UPDATE teams SET {', '.join(updates)}, updated_at = now() WHERE id = ${len(args)}"
                    await conn.execute(query, *args)

                if tabs is not None:
                    await conn.execute("DELETE FROM team_tabs WHERE team_id = $1", team_id)
                    for tab in tabs:
                        if tab in VALID_TABS:
                            await conn.execute(
                                "INSERT INTO team_tabs (team_id, tab) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                                team_id,
                                tab,
                            )

                if namespaces is not None:
                    await conn.execute("DELETE FROM team_namespaces WHERE team_id = $1", team_id)
                    for ns in namespaces:
                        ns_clean = ns.strip()
                        if ns_clean:
                            await conn.execute(
                                "INSERT INTO team_namespaces (team_id, namespace) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                                team_id,
                                ns_clean,
                            )

        return await self.get_team_by_id(team_id)

    async def delete_team(self, team_id: int) -> bool:
        """Delete a team (cascades to members, tabs, and namespaces)."""
        async with self._acquire() as conn:
            result = await conn.execute("DELETE FROM teams WHERE id = $1", team_id)
            count = int(result.split()[-1]) if result else 0
            return count > 0

    async def add_team_member(self, team_id: int, user_id: int) -> bool:
        """Add a user to a team."""
        async with self._acquire() as conn:
            result = await conn.execute(
                "INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                team_id,
                user_id,
            )
            return True

    async def remove_team_member(self, team_id: int, user_id: int) -> bool:
        """Remove a user from a team."""
        async with self._acquire() as conn:
            result = await conn.execute(
                "DELETE FROM team_members WHERE team_id = $1 AND user_id = $2",
                team_id,
                user_id,
            )
            count = int(result.split()[-1]) if result else 0
            return count > 0

    async def get_user_teams(self, user_id: int) -> List[Dict[str, Any]]:
        """Get all teams a user belongs to."""
        async with self._acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT t.id, t.name, t.description, t.access_level, t.all_namespaces
                FROM team_members tm
                JOIN teams t ON t.id = tm.team_id
                WHERE tm.user_id = $1
                ORDER BY t.name ASC
                """,
                user_id,
            )
            teams = []
            for r in rows:
                team_id = r["id"]
                tabs = await conn.fetch(
                    "SELECT tab FROM team_tabs WHERE team_id = $1",
                    team_id,
                )
                namespaces = await conn.fetch(
                    "SELECT namespace FROM team_namespaces WHERE team_id = $1",
                    team_id,
                )
                teams.append(
                    {
                        "id": r["id"],
                        "name": r["name"],
                        "description": r["description"],
                        "access_level": r["access_level"],
                        "all_namespaces": r["all_namespaces"],
                        "tabs": [row["tab"] for row in tabs],
                        "namespaces": [row["namespace"] for row in namespaces],
                    }
                )
            return teams

    async def get_user_effective_permissions(self, user: Dict[str, Any]) -> Dict[str, Any]:
        """Compute effective permissions for a user across all their teams.
        
        Admins always have full cluster access:
          - access_level: 'write'
          - all_namespaces: True
          - namespaces: []
          - tabs: ['pod_monitoring', 'security_scanner', 'diagram', 'ai_advice', 'admin']
          - has_team: True
        
        Members:
          - If in 0 teams:
            - has_team: False
            - access_level: 'read'
            - all_namespaces: False
            - namespaces: []
            - tabs: []
          - If in 1+ teams:
            - has_team: True
            - access_level: 'write' if ANY team has access_level == 'write' else 'read'
            - all_namespaces: True if ANY team has all_namespaces == True else False
            - namespaces: union of namespaces across all teams
            - tabs: union of tabs across all teams
        """
        if user.get("role") == "admin":
            return {
                "role": "admin",
                "has_team": True,
                "access_level": "write",
                "all_namespaces": True,
                "namespaces": [],
                "tabs": ["pod_monitoring", "security_scanner", "diagram", "ai_advice", "admin"],
                "teams": [],
            }

        teams = await self.get_user_teams(user["id"])
        if not teams:
            return {
                "role": "member",
                "has_team": False,
                "access_level": "read",
                "all_namespaces": False,
                "namespaces": [],
                "tabs": [],
                "teams": [],
            }

        all_ns = any(t["all_namespaces"] for t in teams)
        namespaces_set = set()
        tabs_set = set()
        has_write = any(t["access_level"] == "write" for t in teams)

        for t in teams:
            if not all_ns:
                for ns in t.get("namespaces", []):
                    namespaces_set.add(ns)
            for tab in t.get("tabs", []):
                tabs_set.add(tab)

        return {
            "role": "member",
            "has_team": True,
            "access_level": "write" if has_write else "read",
            "all_namespaces": all_ns,
            "namespaces": sorted(list(namespaces_set)) if not all_ns else [],
            "tabs": sorted(list(tabs_set)),
            "teams": [{"id": t["id"], "name": t["name"], "access_level": t["access_level"]} for t in teams],
        }
