---
title: Pod Monitoring
description: Real-time pod failure detection with AI-generated troubleshooting, live logs, and manifest inspection.
---

Kure continuously watches all pods across your cluster and detects failures the moment they happen.

## Detected failure types

| Failure reason | Description |
|----------------|-------------|
| `CrashLoopBackOff` | Container keeps crashing and restarting |
| `ImagePullBackOff` | Unable to pull container image |
| `ErrImagePull` | Error during image pull |
| `CreateContainerError` | Error creating container |
| `RunContainerError` | Error running container |
| `OOMKilled` | Container killed due to out of memory |
| `Pending` | Pod stuck in pending state (after `agent.pendingGracePeriod`) |
| `FailedScheduling` | Cannot schedule pod to any node |
| `FailedMount` | Volume mount failure |

## How AI solutions are generated

1. Agent detects pod failure via the Kubernetes watch API
2. Agent collects context: events, logs (last 100 lines), manifest, container statuses
3. Agent POSTs to backend (`/api/pods/failed`)
4. Backend checks exclusion rules
5. Backend generates a solution:
   - If LLM configured → send context to the AI provider
   - Otherwise → use rule-based solutions
6. Backend stores in PostgreSQL
7. Backend broadcasts via WebSocket to the frontend
8. Frontend renders the failure card

The solution always includes:

- **Diagnosis** — what's wrong
- **Step-by-step fix**
- **Prevention tips**
- **Useful kubectl commands**

## Dashboard views: Failing pods & Live Pods

The **Pod Monitoring** section is split into two views:

- **Failing pods**: Focuses strictly on pods requiring attention across lifecycle filters (**Active**, **History**, **Ignored**). Includes instant AI diagnoses, failure causes, container statuses, and remediation steps.
- **Live Pods**: Cluster-wide inventory of all pods running in the selected namespace (or across all namespaces if granted access). Displays real-time pod name, readiness status (`1/1`, `2/2`), lifecycle phase (`Running`, `Completed`, `CrashLoopBackOff`), restart count, node, and age.

![Live Pods Table and Real-Time Inventory](/images/live_pods.png)

### Live Pods inspection & Live streaming logs

From the **Live Pods** table, click the terminal/play icon on any pod to open the **Pod Logs** modal:

- **Snapshot logs**: View static tail lines (50, 100, 500, 1000, 2000 lines) or view logs from a previous crashed container instance.
- **Live stream (Play / Pause button)**: Click the **Play** button to establish a real-time Server-Sent Events (SSE) stream (`/api/pods/{ns}/{name}/logs/stream`). Logs stream continuously into the terminal viewer until paused or closed.
- **Container switching**: Seamlessly toggle between containers in multi-container pods without leaving the viewer.
- **Download**: Export the full log buffer directly to a `.txt` file for offline analysis or escalation tickets.

## Pod details (Failing pods)

Click any failed pod card in the **Failing pods** view to inspect:

- **Pod metadata** — node, phase, creation time
- **Error details** — failure reason and message
- **Container statuses** — state, image, restart count
- **Recent events** — Kubernetes events with timestamps
- **AI solution** — the generated guide
- **Pod manifest** — with lines highlighted that the AI referenced

## Live logs for failing pods

1. Expand the pod row or click **Logs**
2. Pick a container (if multi-container)
3. Pick a tail length (50 / 100 / 500 / 1000 / 2000 lines)
4. Toggle **Previous container** to see logs from a crashed previous instance
5. Click **Play** to switch from snapshot to continuous live log streaming

Logs stream over Server-Sent Events at `/api/pods/{ns}/{name}/logs/stream`.

## Pod lifecycle actions

| Action | Effect |
|--------|--------|
| **Mark as Investigating** (eye icon) | Show the rest of the team that someone is on it |
| **Mark as Resolved** (checkmark) | Move to history |
| **Ignore** | Hide from active view |
| **Restore** | Move back from history or ignored |
| **Retry AI** | Regenerate the AI solution with fresh context |
| **Dismiss** | Drop the failure |

Configure auto-cleanup of resolved and ignored pods from **Admin → Settings**.

## Exclusions

Stop monitoring noisy namespaces or short-lived pods from **Admin → Suppressions**:

- **Namespace exclusions** — e.g. `kube-system`, `kube-public`, `kure-system`
- **Pod patterns** — wildcards: `test-*`, `*-job-*`, `debug-*`

## Pending grace period

Pods that enter `Pending` are flagged only after `agent.pendingGracePeriod` seconds have elapsed (default `120`). This avoids paging on transient pod creation latency.

```yaml
agent:
  pendingGracePeriod: 120  # seconds
```

## Mirror pod testing

For any failing pod with an AI solution, you can [deploy a mirror pod](/features/mirror-pod/) — a temporary copy with the AI fix applied — to verify the fix works before committing to git.
