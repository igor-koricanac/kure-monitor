---
title: Features Overview
description: A tour of every feature in Kure Monitor — pod monitoring, security scanning, topology diagram, mirror pod testing, and more.
---

Kure Monitor's dashboard is organized into tabs. Each tab is documented in detail below.

All four features can be individually enabled or disabled at install time via the `features.*` Helm values — see [Helm Values → Feature toggles](/configuration/helm-values/#feature-toggles). Disabling a feature hides its tab and, for Pod Monitoring and Security Scanning, also skips deploying the corresponding workloads and RBAC.

| Feature | What it does |
|---------|--------------|
| [Pod Monitoring](/features/pod-monitoring/) | Real-time failure detection with AI-generated solutions (Failing pods) and cluster-wide live inventory with real-time log streaming (Live Pods) |
| [Multi-LLM Support](/features/multi-llm/) | Multiple simultaneous AI provider profiles with designated default, automatic failover, and per-triage selection |
| [Security Scanner](/features/security-scanner/) | 50+ misconfiguration checks with AI remediation, trusted-registry suppressions, and CSV/JSON/PDF export |
| [Topology Diagram](/features/diagram/) | Interactive Kubernetes graph (per-namespace and per-workload), click nodes for manifests, click edges to focus paths |
| [AI Advice](/features/advice/) | Proactive cluster hygiene scanner with 38+ detectors and lazy on-demand AI explanations |
| [Custom Instructions](/features/custom-instructions/) | Prepend custom Markdown instructions (`.md`) to every AI diagnosis and root-cause analysis prompt |
| [Teams & RBAC](/configuration/authentication/#teams--granular-rbac) | Granular multi-tenant team management with per-tab, per-namespace, and read/write permission scoping |
| [Keycloak SSO](/configuration/authentication/#keycloak-sso-integration) | Enterprise OIDC single sign-on with group access gating, admin mapping, and secure Secret integration |
| [Mirror Pod Testing](/features/mirror-pod/) | Deploy a temporary copy of a failing pod with the AI fix applied — verify before committing to git |
| [Notifications](/features/notifications/) | Slack and Microsoft Teams webhooks for new failures and critical findings |

## Cross-cutting

### Real-time updates

All data updates in real-time via WebSocket. No manual refresh, no polling.

### Dark mode

Toggle the sun/moon icon in the header. Dark theme is fully wired across status badges, modals, settings, and the manifest viewer.

### Pod lifecycle states

Pods cycle through:

| State | Meaning |
|-------|---------|
| **Active** | Currently failing, needs attention |
| **Investigating** | Someone is working on it |
| **Resolved** | Fixed; moved to history |
| **Ignored** | Intentionally hidden |


### Authentication & Access Control

User accounts (`admin` / `member`) and Keycloak OIDC SSO for the dashboard, with granular namespace and tab permissions governed by **Teams**; a separate shared `SERVICE_TOKEN` for agent and scanner traffic. See [Authentication](/configuration/authentication/) for the full model.
