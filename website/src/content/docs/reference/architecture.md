---
title: Architecture
description: How Kure Monitor is built — components, data flow, RBAC, and high-availability recommendations.
---

Kure Monitor ships five components that together provide failure detection, security scanning, and AI-powered troubleshooting.

## System overview

![Kure Monitor System Architecture](/images/architecture.svg)

## Components

### Agent (DaemonSet)

Watches the Kubernetes API for pod failures and reports them to the backend.

- **Stack**: Python 3.11, Kubernetes Python client, asyncio, aiohttp
- **Runs**: one pod per node
- **Auth**: `X-Service-Token` to backend

Sample report:

```json
{
  "name": "failing-pod",
  "namespace": "default",
  "reason": "CrashLoopBackOff",
  "message": "Back-off restarting failed container",
  "events": [...],
  "logs": "Error: Cannot connect to database...",
  "manifest": {...},
  "container_statuses": [...]
}
```

### Backend (Deployment)

The brain. Receives reports, generates AI solutions, stores results, broadcasts to the frontend.

- **Stack**: Python 3.11, FastAPI, Pydantic, asyncpg, WebSockets
- **REST API surface** (abridged):

```
/api
├── /auth                       # setup, login, logout, me, SSO/OIDC, invitations
├── /pods                       # failures, live, history, ignored, logs, manifest, troubleshoot
├── /mirror                     # preview, deploy, status, delete, active
├── /security                   # findings, manifest, AI fixes, rescan
├── /advice                     # findings, export, lazy AI explain, detectors
├── /chat                       # AI chat, history, sessions
├── /chatops                    # Slack & MS Teams webhooks
├── /diagram                    # namespaces, namespace/workload/RBAC graphs, manifest
├── /llm/available              # user-facing available LLM configs
├── /admin
│   ├── /llm/*                  # multi-LLM configs, default, test, custom instructions
│   ├── /users & /invitations   # user & invitation management
│   ├── /teams                  # teams, members, namespace & tab RBAC
│   ├── /sso/config             # OIDC / Keycloak SSO configuration
│   ├── /audit-logs             # admin-only audit log query, export, retention
│   ├── /excluded-*             # namespace, pod, and rule suppressions
│   ├── /trusted-registries     # trusted image registries
│   ├── /notifications          # Slack / Teams
│   └── /settings/*             # mirror TTL & app settings
└── /ws                         # WebSocket (real-time UI + admin audit stream)
```

See the full [API Reference](/reference/api/).

### Frontend (Deployment)

React 18 + Tailwind dashboard. Real-time updates via WebSocket.

| Route | Purpose |
|-------|---------|
| `/login` | Sign-in / initial admin setup |
| `/` | Pod failures dashboard |
| `/security` | Security findings |
| `/diagram` | Topology graph (2.3.2+; RBAC mode added in 2.3.3) |
| `/admin` | Admin panel |

### Security Scanner (Deployment)

Audits all pods for security misconfigurations on a schedule and on demand. Reports findings to the backend with `X-Service-Token`.

### PostgreSQL (StatefulSet)

Persistent storage for failures, security findings, admin settings, exclusions.

| Table | Description |
|-------|-------------|
| `failed_pods` | Pod failure records with AI solutions |
| `security_issues` | Security scan results and AI fixes |
| `advice_findings` | AI Advice detector findings and lazy explanations |
| `audit_logs` | Admin-only immutable audit trail (`JSONB` details) |
| `llm_configs` | Multi-LLM provider configurations and custom instructions |
| `admin_config` | Notification, SSO, and application settings |
| `pod_exclusions` / `namespace_exclusions` | Suppressed pods, namespaces, and rules |
| `users` / `teams` / `team_members` | Dashboard accounts, invitations, and namespace/tab RBAC |

## Data flows

### Pod failure detection

```
1. Pod enters failure state
2. Agent detects via watch API
3. Agent collects events, logs, manifest, container statuses
4. Agent POSTs /api/pods/failed (X-Service-Token)
5. Backend checks exclusion rules
6. Backend generates solution (LLM or rule-based fallback)
7. Backend stores in PostgreSQL
8. Backend broadcasts via WebSocket
9. Frontend renders the failure card
```

### Security scanning

```
1. Scanner lists all pods
2. Runs security checks per pod
3. POSTs findings to backend
4. Backend stores in PostgreSQL
5. Frontend displays in Security tab
```

### Mirror pod testing

```
1. User clicks "Test Fix" on a failing pod
2. Frontend → POST /api/mirror/preview/{pod_id}
3. Backend fetches failure context, calls LLM, returns fixed manifest + explanation
4. (Optional) user edits manifest
5. User clicks Deploy → POST /api/mirror/deploy/{pod_id}
6. Backend creates mirror pod via K8s API:
   - Renames with "-mirror-{hash}" suffix
   - Adds labels excluding it from monitoring/scanning
   - Tracks TTL for auto-cleanup
7. Frontend polls GET /api/mirror/status/{mirror_id}
8. Mirror auto-deletes after TTL expires
```

## Communication protocols

### REST

CRUD on failures and findings, configuration management, one-shot data retrieval.

### WebSocket

Real-time push:

```json
{
  "type": "pod_failure",
  "data": {
    "id": "uuid",
    "name": "pod-name",
    "namespace": "default",
    "reason": "CrashLoopBackOff",
    "solution": "..."
  }
}
```

### Internal traffic matrix

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| Agent | Backend | HTTP/REST | Report failures |
| Agent | K8s API | HTTPS | Watch pods |
| Scanner | Backend | HTTP/REST | Report issues |
| Scanner | K8s API | HTTPS | List pods |
| Backend | PostgreSQL | TCP | Data storage |
| Backend | LLM | HTTPS | Generate solutions |
| Frontend | Backend | HTTP/WS | UI data |

## Deployment topology

```yaml
Namespace: kure-system
├── DaemonSet:    kure-agent              (one pod per node)
├── Deployment:   kure-backend            (replicas: 1-3)
├── Deployment:   kure-frontend           (replicas: 1-3)
├── Deployment:   kure-security-scanner   (replicas: 1)
├── StatefulSet:  postgresql              (replicas: 1)
├── Services:     kure-backend, kure-frontend, postgresql
├── ConfigMap:    kure-config
├── Secrets:      <release>-bootstrap, kure-secrets
└── ServiceAccounts + ClusterRoles + ClusterRoleBindings
```

## RBAC

### Agent ServiceAccount

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "events", "nodes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["pods", "nodes"]
    verbs: ["get", "list"]
```

### Backend ServiceAccount

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "create", "delete"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
  - apiGroups: [""]
    resources: ["events"]
    verbs: ["list"]
  # plus diagram-related verbs (see /features/diagram/)
```

> **Note:** the backend ServiceAccount is **intentionally not granted access to Secrets**. See [Topology Diagram → Security model](/features/diagram/#security-model).

### Security Scanner ServiceAccount

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "namespaces"]
    verbs: ["get", "list", "watch"]
```

## High availability

| Component | HA strategy |
|-----------|-------------|
| Backend | 2-3 replicas |
| Frontend | 2-3 replicas |
| PostgreSQL | External managed DB (RDS, Cloud SQL) for production |
| Agent | DaemonSet (inherently HA) |
| Scanner | Single replica (stateless) |

For multi-replica backends (2.6.3+):
- Real-time WebSocket broadcasts and LLM config reloads stay synchronized across all replicas via PostgreSQL `LISTEN/NOTIFY` (`kure_ws_events`, `kure_config_events`) with per-pod deduplication.
- Background cleanup jobs use PostgreSQL advisory locks so only one replica executes each cycle.
- The bootstrap Secret keeps `session-secret` consistent across replicas — see [Authentication](/configuration/authentication/).


## Container hardening

All containers run with:

- Non-root user (UID 1001)
- Read-only root filesystem
- No privilege escalation
- Dropped capabilities
- Seccomp `RuntimeDefault`
