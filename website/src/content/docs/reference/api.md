---
title: API Reference
description: Complete REST API reference for the Kure Monitor backend — pods, security, mirror, diagram, admin, WebSocket.
---

Complete REST API documentation for the Kure Monitor backend.

**Base URL:** `http://<backend-host>:8000/api`

## Authentication

Two distinct mechanisms (since 2.3.0):

- **User sessions** (cookie-based) for dashboard / browser traffic
- **Service token** (`X-Service-Token` header) for agent and scanner traffic

The legacy `AUTH_API_KEY` / `auth.apiKey` single-key model was removed in 2.3.0.

### User sessions (dashboard)

Log in with `POST /api/auth/login` (username + password). On success the backend sets an HttpOnly cookie named `kure_session`, signed with `SESSION_SECRET`. All subsequent `/api/*` calls from the browser use that cookie automatically.

Rate limit: **5 login attempts per 30 seconds**.

### Service token (agent / scanner)

Ingest endpoints authenticate with the `X-Service-Token` HTTP header:

```
X-Service-Token: <SERVICE_TOKEN value>
```

WebSocket and SSE log streams use a query parameter instead:

```
ws://localhost:8000/api/ws?token=YOUR_SERVICE_TOKEN
GET /api/pods/{namespace}/{pod_name}/logs/stream?token=YOUR_SERVICE_TOKEN
```

### Always-public endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health`, `GET /metrics` | Liveness / Prometheus scrape |
| `GET /api/auth/setup-required` | Whether initial admin setup is needed |
| `POST /api/auth/setup` | Create the initial admin (only when no users exist) |
| `POST /api/auth/login` | Log in with username + password |
| `GET /api/auth/sso/config` | Public SSO / OIDC login availability |
| `GET /api/auth/sso/login` | Start OIDC authorization redirect |
| `GET /api/auth/sso/callback` | OIDC callback handler |
| `GET /api/auth/invitation/{token}` | Validate user invitation token |
| `POST /api/auth/accept-invitation` | Accept invitation and set password |
| `POST /api/chatops/slack/*` | External webhook for Slack interactivity |
| `POST /api/chatops/teams/*` | External webhook for Teams interactivity |

### Service-token-only ingest

| Endpoint | Caller |
|----------|--------|
| `POST /api/pods/failed` | Agent |
| `POST /api/pods/dismiss-deleted` | Agent |
| `POST /api/advice/findings` | Agent |
| `POST /api/security/findings` | Scanner |
| `POST /api/security/scan/clear` | Scanner |
| `POST /api/security/rescan-status` | Scanner |
| `DELETE /api/security/findings/resource/{type}/{ns}/{name}` | Scanner |
| `POST /api/metrics/security-scan-duration` | Scanner |

### Error response

```http
401 Unauthorized
{
  "detail": "Not authenticated"
}
```

## Endpoints overview

| Category | Endpoint | Description |
|----------|----------|-------------|
| Config | `GET /config` | App status |
| Auth | `GET /auth/setup-required`, `POST /auth/setup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Session authentication |
| Auth (SSO) | `GET /auth/sso/config`, `GET /auth/sso/login`, `GET /auth/sso/callback` | OIDC / Keycloak SSO login |
| Auth (Invites) | `GET /auth/invitation/{token}`, `POST /auth/accept-invitation` | User invitation onboarding |
| Pods | `POST /pods/failed` | Report failure (Agent) |
| Pods | `GET /pods/failed`, `GET /pods/live` | List active failures / live cluster pods |
| Pods | `GET /pods/history`, `GET /pods/ignored` | List resolved / ignored pods |
| Pods | `PUT /pods/{id}/status` | Update status |
| Pods | `DELETE /pods/failed/{id}` | Dismiss failure |
| Pods | `POST /pods/failed/{id}/retry-solution` | Regenerate AI solution |
| Pods | `POST /pods/failed/{id}/troubleshoot` | Log-aware AI troubleshooting |
| Pods | `GET /pods/{ns}/{name}/manifest` | Get live pod YAML manifest |
| Pods | `GET /pods/{ns}/{name}/logs`, `GET /pods/{ns}/{name}/logs/stream` | Fetch or stream (SSE) pod logs |
| Security | `POST /security/findings`, `GET /security/findings` | Report / list findings |
| Security | `GET /security/findings/{id}/manifest` | Get workload YAML manifest for finding |
| Security | `POST /security/findings/{id}/fix` | Generate AI fix & diff |
| Security | `POST /security/rescan` | Trigger on-demand security rescan |
| Advice | `POST /advice/findings`, `GET /advice/findings`, `GET /advice/findings/export` | Report, list, or export advice findings |
| Advice | `GET /advice/findings/{id}`, `POST /advice/findings/{id}/explain` | Finding details & lazy AI explanation |
| Advice | `PUT /advice/findings/{id}/ignore`, `DELETE /advice/findings/{id}` | Ignore or delete advice finding |
| Advice | `GET /advice/detectors`, `PUT /advice/detectors/{detector_id}` | List or configure advice detectors |
| Chat | `POST /chat`, `GET /chat/history`, `GET /chat/sessions`, `DELETE /chat/history` | Interactive AI troubleshooting chat |
| ChatOps | `POST /chatops/slack/events`, `POST /chatops/slack/interact`, `POST /chatops/teams/interact` | Slack & MS Teams webhooks |
| Mirror | `POST /mirror/preview/{id}`, `POST /mirror/deploy/{id}` | Generate fixed manifest & deploy mirror pod |
| Mirror | `GET /mirror/status/{id}`, `DELETE /mirror/{id}`, `GET /mirror/active` | Mirror status, cleanup, active list |
| Diagram | `GET /diagram/namespaces`, `GET /diagram/namespace/{ns}` | Namespaces & per-namespace graph |
| Diagram | `GET /diagram/workloads/{ns}/{kind}`, `GET /diagram/workload/{ns}/{kind}/{name}` | Workloads list & per-workload graph |
| Diagram | `GET /diagram/roles`, `GET /diagram/role/{ns}/{name}`, `GET /diagram/clusterrole/{name}` | RBAC roles & permission graphs |
| Diagram | `GET /diagram/manifest/{ns}/{kind}/{name}` | Live manifest (rejects `Secret` with 403) |
| LLM | `GET /llm/available` | List available LLM configs for UI selector |
| Admin (LLM) | `GET / POST / PUT / DELETE /admin/llm/configs*`, `/admin/llm/instructions`, `/admin/llm-discovery` | Multi-LLM configs, custom instructions, discovery |
| Admin (Users) | `GET / PATCH / DELETE /admin/users*`, `GET / POST / DELETE /admin/invitations*` | User & invitation management |
| Admin (Teams) | `GET / POST / PUT / DELETE /admin/teams*`, `GET /admin/cluster-namespaces` | Team RBAC, namespace & tab scoping |
| Admin (SSO) | `GET / POST /admin/sso/config` | Configure OIDC / Keycloak SSO |
| Admin (Audit) | `GET /admin/audit-logs`, `GET /admin/audit-logs/export`, `GET / PUT /admin/audit-logs/retention` | Admin-only audit log & retention |
| Admin (Rules) | `GET / POST / DELETE /admin/excluded-*`, `/admin/trusted-registries` | Namespace/pod/rule suppressions & registries |
| Admin (Notify) | `GET / POST / PUT / DELETE /admin/notifications*` | Slack / MS Teams notifications |
| Admin (Settings) | `GET / POST /admin/settings/*` | App settings (e.g. mirror TTL) |

## Pod monitoring

### Report failed pod

```http
POST /api/pods/failed
```

Request body:

```json
{
  "pod_name": "my-app-7d9f8b6c4-abc12",
  "namespace": "default",
  "node_name": "worker-1",
  "failure_reason": "CrashLoopBackOff",
  "failure_message": "Back-off restarting failed container",
  "creation_timestamp": "2024-01-15T10:30:00Z",
  "events": [...],
  "container_statuses": [...],
  "manifest": "apiVersion: v1\nkind: Pod\n...",
  "logs": "Error: Database connection failed..."
}
```

Response `200`:

```json
{
  "id": 1,
  "pod_name": "my-app-7d9f8b6c4-abc12",
  "namespace": "default",
  "failure_reason": "CrashLoopBackOff",
  "solution": "## Root Cause\n...",
  "events": [...],
  "container_statuses": [...],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### List failed pods

```http
GET /api/pods/failed
```

Returns all active (non-dismissed) failures.

### Get history / ignored

```http
GET /api/pods/history
GET /api/pods/ignored
```

### Update status

```http
PUT /api/pods/{pod_id}/status
{
  "status": "investigating"
}
```

Valid: `new`, `investigating`, `resolved`, `ignored`.

### Dismiss / restore

```http
DELETE /api/pods/failed/{pod_id}
PUT /api/pods/ignored/{pod_id}/restore
```

### Retry AI / Log-aware troubleshooting

```http
POST /api/pods/failed/{pod_id}/retry-solution
POST /api/pods/failed/{pod_id}/troubleshoot
```

`troubleshoot` fetches fresh container logs and runs a targeted AI root-cause analysis (supports selecting a specific `llm_config_id`).

### Live pods & pod manifest

```http
GET /api/pods/live
GET /api/pods/{namespace}/{pod_name}/manifest
```

Returns live cluster pods (scoped to the user's team namespaces) or a pod's live YAML manifest.

### Get logs

```http
GET /api/pods/{namespace}/{pod_name}/logs
  ?container=app
  &tail_lines=100
  &previous=false
```

### Stream logs (SSE)

```http
GET /api/pods/{namespace}/{pod_name}/logs/stream
  ?container=app
  &tail_lines=100
  &token=<SERVICE_TOKEN>
```

## Security

### Report finding

```http
POST /api/security/findings
{
  "resource_type": "Pod",
  "resource_name": "my-app-7d9f8b6c4-abc12",
  "namespace": "default",
  "check_name": "privileged_container",
  "severity": "critical",
  "message": "Container 'app' is running in privileged mode",
  "remediation": "Remove 'privileged: true' from securityContext",
  "details": {"container": "app", "field": "securityContext.privileged"}
}
```

### List / dismiss / restore / clear

```http
GET    /api/security/findings
DELETE /api/security/findings/{id}
PUT    /api/security/findings/{id}/restore
POST   /api/security/scan/clear
DELETE /api/security/findings/resource/{type}/{ns}/{name}
```

### Get manifest / Generate AI fix / Trigger rescan

```http
GET  /api/security/findings/{id}/manifest
POST /api/security/findings/{id}/fix
POST /api/security/rescan
```

- `manifest` returns the live workload YAML for the finding.
- `fix` returns the LLM-generated fixed YAML and unified red/green diff lines.
- `rescan` triggers an on-demand cluster security scan (requires `write` role).

### Trusted registries

```http
GET    /api/admin/trusted-registries
POST   /api/admin/trusted-registries  { "registry": "..." }
DELETE /api/admin/trusted-registries/{registry}
```

## AI Advice

```http
POST   /api/advice/findings                   # Agent ingest (X-Service-Token)
GET    /api/advice/findings                   # List active advice findings
GET    /api/advice/findings/export            # Export findings (CSV / JSON)
GET    /api/advice/findings/{finding_id}      # Get single finding
POST   /api/advice/findings/{finding_id}/explain  # Generate lazy AI explanation
PUT    /api/advice/findings/{finding_id}/ignore   # Suppress finding
DELETE /api/advice/findings/{finding_id}      # Delete finding

GET    /api/advice/detectors                  # List detectors and status
PUT    /api/advice/detectors/{detector_id}    # Enable/disable or configure detector (Admin)
```

## AI Chat

```http
POST   /api/chat                              # Send a prompt with optional pod/cluster context
GET    /api/chat/sessions                     # List chat sessions
GET    /api/chat/history                      # Fetch messages for a session
DELETE /api/chat/history                      # Clear chat history
```

## Mirror Pod Testing

### Preview fix

```http
POST /api/mirror/preview/{pod_id}
```

Returns:

```json
{
  "fixed_manifest": "apiVersion: v1\nkind: Pod\n...",
  "explanation": "## Changes Made\n1. Added resource limits...",
  "is_fallback": false
}
```

### Deploy

```http
POST /api/mirror/deploy/{pod_id}
{
  "ttl_seconds": 180,
  "manifest": "apiVersion: v1\nkind: Pod\n..."   // optional, overrides preview
}
```

Returns:

```json
{
  "mirror_id": "abc123",
  "mirror_pod_name": "my-app-mirror-abc123",
  "namespace": "default",
  "status": "Pending",
  "ttl_seconds": 180,
  "created_at": "2026-03-26T10:30:00Z",
  "fixed_manifest": "...",
  "explanation": "..."
}
```

### Status / delete / list

```http
GET    /api/mirror/status/{mirror_id}
DELETE /api/mirror/{mirror_id}
GET    /api/mirror/active
```

### TTL setting

```http
GET /api/admin/settings/mirror-ttl
PUT /api/admin/settings/mirror-ttl  { "seconds": 300 }
```

Range: 30 – 3600 seconds. Admin role required for `PUT`.

## Diagram

> Introduced in **2.3.2**. All endpoints gated by `require_read`.

### List namespaces

```http
GET /api/diagram/namespaces
```

```json
{ "namespaces": ["default", "kube-system", "kure-system"] }
```

### Per-namespace graph

```http
GET /api/diagram/namespace/{namespace}
```

```json
{
  "nodes": [{ "id": "...", "kind": "Deployment", "name": "...", "namespace": "..." }],
  "edges": [{ "id": "...", "source": "...", "target": "...", "kind": "owns" }],
  "groups": [{ "id": "...", "label": "my-app", "members": ["..."] }]
}
```

### List workloads / Per-workload graph

```http
GET /api/diagram/workloads/{namespace}/{kind}
GET /api/diagram/workload/{namespace}/{kind}/{name}
```

Valid `kind` values: `Deployment`, `StatefulSet`, `DaemonSet`, `Job`, `CronJob`. Same response shape as the namespace graph.

### Get node manifest

```http
GET /api/diagram/manifest/{namespace}/{kind}/{name}
```

Returns the live manifest as YAML. **Rejects `kind=Secret` with HTTP 403** by design — the backend ServiceAccount has no read access to Secrets. Synthesized kinds (`Permission`, `Subject:User`, `Subject:Group`) are rejected with HTTP 400 because they have no underlying manifest.

### List Roles + ClusterRoles

> Added in **2.3.3**.

```http
GET /api/diagram/roles
```

```json
{
  "cluster_roles": [{ "name": "..." }],
  "roles": [{ "namespace": "...", "name": "..." }]
}
```

### Per-Role graph

> Added in **2.3.3**.

```http
GET /api/diagram/role/{namespace}/{name}
```

Same response shape as the namespace graph. Nodes include the `Role`, its `RoleBinding`s, synthesized `Permission` nodes (one per `(apiGroup, resource)` tuple, with verbs and `resourceNames` in `metadata`), and `Subject:User` / `Subject:Group` / `Subject:ServiceAccount` nodes.

### Per-ClusterRole graph

> Added in **2.3.3**.

```http
GET /api/diagram/clusterrole/{name}
```

Same shape as the per-Role graph but for ClusterRoles + ClusterRoleBindings.

## Admin — LLM, Multi-LLM & Custom Instructions

```http
# Legacy single-config endpoints
GET    /api/admin/llm/status
POST   /api/admin/llm/config   { "provider": "...", "api_key": "...", "model": "..." }
POST   /api/admin/llm/test     { "provider": "...", "api_key": "...", "model": "..." }
DELETE /api/admin/llm/config

# Multi-LLM configurations (supports optional proxy_url & reasoning_effort)
GET    /api/llm/available
GET    /api/admin/llm/configs
POST   /api/admin/llm/configs
PUT    /api/admin/llm/configs/{config_id}
DELETE /api/admin/llm/configs/{config_id}
POST   /api/admin/llm/configs/{config_id}/default
POST   /api/admin/llm/configs/{config_id}/test
GET    /api/admin/llm-discovery

# Custom AI instructions
GET    /api/admin/llm/instructions
PUT    /api/admin/llm/instructions
DELETE /api/admin/llm/instructions
```

See [LLM Providers](/configuration/llm-providers/) and [Multi-LLM Support](/features/multi-llm/) for supported provider/model combinations.

## Admin — Users, Invitations & Teams (RBAC)

```http
# Users & invitations
GET    /api/admin/users
PATCH  /api/admin/users/{user_id}
DELETE /api/admin/users/{user_id}
GET    /api/admin/invitations
POST   /api/admin/invitations
DELETE /api/admin/invitations/{invitation_id}

# Teams & namespace/tab scoping
GET    /api/admin/cluster-namespaces
GET    /api/admin/teams
POST   /api/admin/teams
GET    /api/admin/teams/{team_id}
PUT    /api/admin/teams/{team_id}
DELETE /api/admin/teams/{team_id}
POST   /api/admin/teams/{team_id}/members
DELETE /api/admin/teams/{team_id}/members/{user_id}
```

## Admin — SSO / OIDC

```http
GET    /api/admin/sso/config
POST   /api/admin/sso/config
```

Configures OIDC / Keycloak issuer URL, client ID/secret, redirect URI, and group-to-team mappings.

## Admin — Audit Logs

> Added in **2.6.3**. Strictly admin-only.

```http
GET /api/admin/audit-logs             # Filter by action, actor, resource_type, date range
GET /api/admin/audit-logs/export      # Export as CSV or JSON
GET /api/admin/audit-logs/retention   # Get retention period (days)
PUT /api/admin/audit-logs/retention   # Update retention period
```

## Admin — Exclusions

```http
GET    /api/admin/namespaces
GET    /api/admin/excluded-namespaces
POST   /api/admin/excluded-namespaces   { "namespace": "kube-system" }
DELETE /api/admin/excluded-namespaces/{namespace}

GET    /api/admin/monitored-pods
GET    /api/admin/excluded-pods
POST   /api/admin/excluded-pods         { "pod_name": "test-*" }
DELETE /api/admin/excluded-pods/{pod_name}

GET    /api/admin/rule-titles
GET    /api/admin/excluded-rules
POST   /api/admin/excluded-rules        { "rule_title": "..." }
DELETE /api/admin/excluded-rules/{rule_title}
```

## Admin — Notifications

```http
GET    /api/admin/notifications
POST   /api/admin/notifications
PUT    /api/admin/notifications/{provider}
DELETE /api/admin/notifications/{provider}
POST   /api/admin/notifications/{provider}/test
```

Sample body:

```json
{
  "provider": "slack",
  "enabled": true,
  "config": { "webhook_url": "https://hooks.slack.com/services/..." }
}
```

## Admin — Settings

```http
GET  /api/admin/settings/{key}
POST /api/admin/settings/{key}    { "value": "10080" }
```

Common keys:

- `mirror_pod_ttl_seconds` — time-to-live for temporary mirror pods in seconds (default: `180`)

## WebSocket

```
WS /api/ws
```

Push messages from the backend:

```json
{ "type": "pod_failure", "data": { "id": 1, "pod_name": "...", "solution": "..." } }
{ "type": "pod_deleted", "data": { "namespace": "default", "pod_name": "..." } }
{ "type": "solution_updated", "data": { "id": 1, "solution": "..." } }
{ "type": "security_finding", "data": { "id": 1, "severity": "critical", "message": "..." } }
{ "type": "namespace_exclusion", "data": { "namespace": "kube-system", "action": "excluded" } }
{ "type": "trusted_registry_change", "data": { "registry": "...", "action": "added" } }
{ "type": "pod_status_change", "data": { "id": 1, "status": "investigating" } }
{ "type": "security_rescan_status", "data": { "status": "started", "reason": "trusted_registry_change" } }
{ "type": "advice_finding", "data": { "id": 1, "detector": "missing_pdb", "severity": "medium" } }
{ "type": "audit_log", "data": { "id": 42, "actor": "admin", "action": "llm.config.update" } }
```

## Error responses

| Status | Body |
|--------|------|
| `400` | `{ "detail": "Pod name and namespace are required" }` |
| `401` | `{ "detail": "Not authenticated" }` |
| `403` | `{ "detail": "Secret manifests are not readable by design." }` |
| `404` | `{ "detail": "Pod failure not found" }` |
| `500` | `{ "detail": "Internal server error..." }` |
| `503` | `{ "detail": "Kubernetes client not available" }` |

## OpenAPI / interactive docs

- **Swagger UI**: `http://<backend-host>:8000/docs`
- **ReDoc**: `http://<backend-host>:8000/redoc`
