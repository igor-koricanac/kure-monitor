// Interactive Demo Mock API with Multi-Tenant Team RBAC & Namespace Isolation

export const DEMO_USERS = {
  admin: {
    id: 1,
    username: 'admin',
    email: 'admin@kuremonitor.com',
    role: 'admin',
    demoBadge: 'Admin · All NS',
    demoDescription: 'Full cluster admin access (all namespaces, Admin Panel, Audit Log)',
    teams: [],
    permissions: {
      all_namespaces: true,
      namespaces: [],
      tabs: ['pod_monitoring', 'security_scanner', 'diagram', 'ai_advice'],
      access_level: 'write',
    },
  },
  user_1: {
    id: 2,
    username: 'user_1',
    email: 'user1@kuremonitor.com',
    role: 'member',
    has_team: true,
    all_namespaces: false,
    effective_namespaces: ['production'],
    effective_tabs: ['pod_monitoring', 'security_scanner', 'ai_advice'],
    effective_access_level: 'write',
    demoBadge: 'team_1 · production',
    demoDescription: 'Member of team_1 — write access to production (no Diagram tab)',
    teams: [{ id: 1, name: 'team_1' }],
    permissions: {
      all_namespaces: false,
      namespaces: ['production'],
      tabs: ['pod_monitoring', 'security_scanner', 'ai_advice'],
      access_level: 'write',
    },
  },
  user_2: {
    id: 3,
    username: 'user_2',
    email: 'user2@kuremonitor.com',
    role: 'member',
    has_team: true,
    all_namespaces: false,
    effective_namespaces: ['payments'],
    effective_tabs: ['pod_monitoring', 'security_scanner', 'diagram', 'ai_advice'],
    effective_access_level: 'read',
    demoBadge: 'team_2 · payments',
    demoDescription: 'Member of team_2 — read access restricted to the payments namespace',
    teams: [{ id: 2, name: 'team_2' }],
    permissions: {
      all_namespaces: false,
      namespaces: ['payments'],
      tabs: ['pod_monitoring', 'security_scanner', 'diagram', 'ai_advice'],
      access_level: 'read',
    },
  },
};

let activeUsername = 'admin';

export function setActiveDemoUser(username) {
  activeUsername = DEMO_USERS[username] ? username : 'admin';
}

function getActiveUser() {
  return DEMO_USERS[activeUsername] || DEMO_USERS.admin;
}

function filterByUserNamespaces(items, nsKey = 'namespace') {
  const user = getActiveUser();
  if (user.role === 'admin' || user.permissions?.all_namespaces) return items;
  const allowed = new Set(user.permissions?.namespaces || []);
  return items.filter((it) => allowed.has(it[nsKey]));
}

const nowIso = () => new Date().toISOString();

// --- Stateful Mock Stores ---

let mockFailedPods = [
  {
    id: 1,
    pod_name: 'inventory-sync-5f9b4c8d-x7qz9',
    namespace: 'production',
    node_name: 'worker-node-1',
    phase: 'Running',
    failure_reason: 'CrashLoopBackOff',
    failure_message: 'Back-off restarting failed container inventory-sync',
    status: 'investigating',
    timestamp: nowIso(),
    created_at: nowIso(),
    logs_captured: true,
    solution: `**Root Cause:** \`inventory-sync\` is exiting with HTTP 401 Unauthorized because \`API_TOKEN\` is missing from the container environment.\n\n**Fix:** Create the secret and mount it via \`secretKeyRef\`:\n\`\`\`bash\nkubectl create secret generic api-auth-secret --from-literal=token=<token> -n production\n\`\`\``,
    manifest: `apiVersion: v1\nkind: Pod\nmetadata:\n  name: inventory-sync-5f9b4c8d-x7qz9\n  namespace: production\nspec:\n  containers:\n  - name: inventory-sync\n    image: ghcr.io/acme/inventory-sync:v2.1.0\n    resources:\n      requests:\n        cpu: 100m\n        memory: 128Mi`,
    container_statuses: [
      { name: 'inventory-sync', ready: false, restart_count: 14, state: 'waiting', reason: 'CrashLoopBackOff', image: 'ghcr.io/acme/inventory-sync:v2.1.0' },
    ],
    events: [
      { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container inventory-sync', timestamp: nowIso() },
    ],
    logs: `[INFO] Starting inventory-sync v2.1.0...\n[FATAL] 401 Unauthorized: missing API_TOKEN`,
  },
  {
    id: 2,
    pod_name: 'stripe-webhook-worker-7c4d9b-m9k2p',
    namespace: 'payments',
    node_name: 'worker-node-2',
    phase: 'Running',
    failure_reason: 'OOMKilled',
    failure_message: 'Container webhook-worker exceeded memory limit (256Mi)',
    status: 'new',
    timestamp: new Date(Date.now() - 420000).toISOString(),
    created_at: new Date(Date.now() - 420000).toISOString(),
    logs_captured: true,
    solution: `**Root Cause:** \`stripe-webhook-worker\` hit its 256Mi memory limit during batch reconciliation.\n\n**Fix:** Increase \`resources.limits.memory\` to \`512Mi\` and \`requests.memory\` to \`256Mi\`.`,
    manifest: `apiVersion: v1\nkind: Pod\nmetadata:\n  name: stripe-webhook-worker-7c4d9b-m9k2p\n  namespace: payments\nspec:\n  containers:\n  - name: webhook-worker\n    image: ghcr.io/acme/stripe-webhook:v1.8.2\n    resources:\n      limits:\n        memory: 256Mi`,
    container_statuses: [
      { name: 'webhook-worker', ready: false, restart_count: 6, state: 'terminated', reason: 'OOMKilled', exit_code: 137, image: 'ghcr.io/acme/stripe-webhook:v1.8.2' },
    ],
    events: [
      { type: 'Warning', reason: 'OOMKilling', message: 'Memory cgroup out of memory: Killed process', timestamp: nowIso() },
    ],
    logs: `[INFO] Processing 4,200 webhook events...\n[ERROR] FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory`,
  },
  {
    id: 3,
    pod_name: 'postgres-replica-0',
    namespace: 'database',
    node_name: 'worker-node-3',
    phase: 'Pending',
    failure_reason: 'FailedScheduling',
    failure_message: '0/3 nodes are available: 3 Insufficient memory.',
    status: 'new',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    created_at: new Date(Date.now() - 900000).toISOString(),
    logs_captured: false,
    solution: `**Root Cause:** No worker node has enough free allocatable memory for \`postgres-replica-0\` (requests 8Gi).\n\n**Fix:** Lower \`resources.requests.memory\` or scale the node pool.`,
    manifest: `apiVersion: v1\nkind: Pod\nmetadata:\n  name: postgres-replica-0\n  namespace: database`,
    container_statuses: [],
    events: [
      { type: 'Warning', reason: 'FailedScheduling', message: '0/3 nodes are available: 3 Insufficient memory.', timestamp: nowIso() },
    ],
    logs: '',
  },
];

const mockLivePods = [
  { name: 'api-gateway-6b8f9c-abc12', namespace: 'production', status: 'Running', ready: '1/1', restarts: 0, age: '12d', node: 'worker-node-1', containers: ['gateway'] },
  { name: 'inventory-sync-5f9b4c8d-x7qz9', namespace: 'production', status: 'CrashLoopBackOff', ready: '0/1', restarts: 14, age: '2h', node: 'worker-node-1', containers: ['inventory-sync'] },
  { name: 'checkout-api-8d9e7f-p4r2s', namespace: 'payments', status: 'Running', ready: '2/2', restarts: 1, age: '5d', node: 'worker-node-2', containers: ['checkout', 'envoy-sidecar'] },
  { name: 'stripe-webhook-worker-7c4d9b-m9k2p', namespace: 'payments', status: 'OOMKilled', ready: '0/1', restarts: 6, age: '45m', node: 'worker-node-2', containers: ['webhook-worker'] },
  { name: 'postgres-primary-0', namespace: 'database', status: 'Running', ready: '1/1', restarts: 0, age: '40d', node: 'worker-node-3', containers: ['postgres'] },
];

let mockSecurityFindings = [
  {
    id: 101,
    resource_type: 'Deployment',
    resource_name: 'inventory-sync',
    namespace: 'production',
    severity: 'HIGH',
    rule_id: 'KSV013',
    title: 'Container runs as root',
    description: 'Container inventory-sync does not set securityContext.runAsNonRoot: true.',
    remediation: 'Set securityContext.runAsNonRoot: true and runAsUser: 1001.',
    dismissed: false,
    timestamp: nowIso(),
  },
  {
    id: 102,
    resource_type: 'Deployment',
    resource_name: 'checkout-api',
    namespace: 'payments',
    severity: 'CRITICAL',
    rule_id: 'KSV014',
    title: 'Root filesystem is not read-only',
    description: 'Container checkout allows writes to the root filesystem.',
    remediation: 'Set securityContext.readOnlyRootFilesystem: true.',
    dismissed: false,
    timestamp: nowIso(),
  },
  {
    id: 103,
    resource_type: 'StatefulSet',
    resource_name: 'postgres-primary',
    namespace: 'database',
    severity: 'MEDIUM',
    rule_id: 'KSV111',
    title: 'Missing NetworkPolicy',
    description: 'Workload postgres-primary is not selected by any NetworkPolicy.',
    remediation: 'Create a NetworkPolicy restricting ingress on port 5432.',
    dismissed: false,
    timestamp: nowIso(),
  },
];

let mockAdviceFindings = [
  {
    id: 201,
    detector_id: 'oom-prone-memory-headroom',
    severity: 'high',
    category: 'reliability',
    title: 'Tight memory headroom on stripe-webhook-worker',
    summary: 'Memory limit (256Mi) leaves <10% headroom above observed peak usage.',
    resource_kind: 'Deployment',
    resource_name: 'stripe-webhook-worker',
    namespace: 'payments',
    evidence: { limit: '256Mi', peak: '248Mi' },
    recommended_change: 'Increase memory limit to 512Mi and request to 256Mi.',
    confidence: 0.94,
    timestamp: nowIso(),
    dismissed: false,
  },
  {
    id: 202,
    detector_id: 'single-replica-behind-service',
    severity: 'medium',
    category: 'availability',
    title: 'Single replica behind production Service',
    summary: 'Deployment api-gateway has replicas=1 behind a production Service.',
    resource_kind: 'Deployment',
    resource_name: 'api-gateway',
    namespace: 'production',
    evidence: { replicas: 1, service: 'api-gateway-svc' },
    recommended_change: 'Increase replicas to >= 2 and add a PodDisruptionBudget.',
    confidence: 0.91,
    timestamp: nowIso(),
    dismissed: false,
  },
];

let mockLLMConfigs = [
  {
    id: 1,
    name: 'GitHub Copilot (Production)',
    provider: 'copilot',
    model: 'openai/gpt-5.5-mini',
    base_url: 'https://models.github.ai/inference',
    reasoning_effort: 'medium',
    proxy_url: 'http://proxy.corp.local:8080',
    is_default: true,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: 2,
    name: 'Local Ollama (Air-Gapped)',
    provider: 'ollama',
    model: 'llama3.2',
    base_url: 'http://ollama.ai.svc:11434',
    reasoning_effort: null,
    proxy_url: null,
    is_default: false,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  },
];

let mockTeams = [
  {
    id: 1,
    name: 'team_1',
    description: 'Production Platform Team',
    access_level: 'write',
    all_namespaces: false,
    namespaces: ['production'],
    tabs: ['pod_monitoring', 'security_scanner', 'ai_advice'],
    members: [{ id: 2, username: 'user_1', email: 'user1@kuremonitor.com', role: 'member' }],
  },
  {
    id: 2,
    name: 'team_2',
    description: 'Payments Engineering Team',
    access_level: 'read',
    all_namespaces: false,
    namespaces: ['payments'],
    tabs: ['pod_monitoring', 'security_scanner', 'diagram', 'ai_advice'],
    members: [{ id: 3, username: 'user_2', email: 'user2@kuremonitor.com', role: 'member' }],
  },
];

let mockAuditRetentionDays = 90;
let mockAuditLogs = [
  {
    id: 3,
    created_at: new Date(Date.now() - 120000).toISOString(),
    actor_id: 1,
    actor_username: 'admin',
    actor_role: 'admin',
    action: 'llm_config.update',
    resource_type: 'llm_config',
    resource_name: 'GitHub Copilot (Production)',
    ip_address: '10.244.0.15',
    status: 'success',
    details: { method: 'PUT', path: '/api/admin/llm/configs/1', payload: { reasoning_effort: 'medium', proxy_url: 'http://proxy.corp.local:8080', api_key: '[REDACTED]' } },
  },
  {
    id: 2,
    created_at: new Date(Date.now() - 600000).toISOString(),
    actor_id: 2,
    actor_username: 'user_1',
    actor_role: 'member',
    action: 'pod.dismiss',
    resource_type: 'pod_failure',
    resource_name: 'production/cache-warmer-7f8a',
    ip_address: '10.244.1.22',
    status: 'success',
    details: { method: 'DELETE', path: '/api/pods/failed/42', status_code: 200 },
  },
  {
    id: 1,
    created_at: new Date(Date.now() - 1800000).toISOString(),
    actor_id: 1,
    actor_username: 'admin',
    actor_role: 'admin',
    action: 'team.create',
    resource_type: 'team',
    resource_name: 'team_2',
    ip_address: '10.244.0.15',
    status: 'success',
    details: { method: 'POST', path: '/api/admin/teams', payload: { name: 'team_2', namespaces: ['payments'], access_level: 'read' } },
  },
];

function recordDemoAudit(action, resource_type, resource_name, details = {}) {
  const u = getActiveUser();
  mockAuditLogs = [
    {
      id: Date.now(),
      created_at: nowIso(),
      actor_id: u.id,
      actor_username: u.username,
      actor_role: u.role,
      action,
      resource_type,
      resource_name,
      ip_address: '127.0.0.1',
      status: 'success',
      details,
    },
    ...mockAuditLogs,
  ];
}

const NAMESPACE_DIAGRAMS = {
  production: {
    nodes: [
      { id: 'ing-prod', kind: 'Ingress', name: 'prod-ingress', namespace: 'production', status: 'Active' },
      { id: 'svc-api', kind: 'Service', name: 'api-gateway-svc', namespace: 'production', status: 'ClusterIP' },
      { id: 'dep-api', kind: 'Deployment', name: 'api-gateway', namespace: 'production', status: '1/1 Ready' },
      { id: 'rs-api', kind: 'ReplicaSet', name: 'api-gateway-6b8f9c', namespace: 'production', status: '1/1' },
      { id: 'pod-api', kind: 'Pod', name: 'api-gateway-6b8f9c-abc12', namespace: 'production', status: 'Running' },
      { id: 'dep-inv', kind: 'Deployment', name: 'inventory-sync', namespace: 'production', status: '0/1 Ready' },
      { id: 'pod-inv', kind: 'Pod', name: 'inventory-sync-5f9b4c8d-x7qz9', namespace: 'production', status: 'CrashLoopBackOff' },
      { id: 'cm-prod', kind: 'ConfigMap', name: 'prod-config', namespace: 'production', status: 'Active' },
      { id: 'sec-prod', kind: 'Secret', name: 'api-auth-secret', namespace: 'production', status: 'Derived', metadata: { derived: true } },
    ],
    edges: [
      { source: 'ing-prod', target: 'svc-api', type: 'routes' },
      { source: 'svc-api', target: 'pod-api', type: 'selects' },
      { source: 'dep-api', target: 'rs-api', type: 'owns' },
      { source: 'rs-api', target: 'pod-api', type: 'owns' },
      { source: 'pod-api', target: 'cm-prod', type: 'mounts' },
      { source: 'dep-inv', target: 'pod-inv', type: 'owns' },
      { source: 'pod-inv', target: 'sec-prod', type: 'mounts' },
    ],
    groups: [],
  },
  payments: {
    nodes: [
      { id: 'ing-pay', kind: 'Ingress', name: 'payments-ingress', namespace: 'payments', status: 'Active' },
      { id: 'svc-chk', kind: 'Service', name: 'checkout-api-svc', namespace: 'payments', status: 'ClusterIP' },
      { id: 'dep-chk', kind: 'Deployment', name: 'checkout-api', namespace: 'payments', status: '2/2 Ready' },
      { id: 'pod-chk', kind: 'Pod', name: 'checkout-api-8d9e7f-p4r2s', namespace: 'payments', status: 'Running' },
      { id: 'dep-wh', kind: 'Deployment', name: 'stripe-webhook-worker', namespace: 'payments', status: '0/1 Ready' },
      { id: 'pod-wh', kind: 'Pod', name: 'stripe-webhook-worker-7c4d9b-m9k2p', namespace: 'payments', status: 'OOMKilled' },
      { id: 'np-pay', kind: 'NetworkPolicy', name: 'payments-egress-lock', namespace: 'payments', status: 'Active' },
      { id: 'sec-stripe', kind: 'Secret', name: 'stripe-signing-key', namespace: 'payments', status: 'Derived', metadata: { derived: true } },
    ],
    edges: [
      { source: 'ing-pay', target: 'svc-chk', type: 'routes' },
      { source: 'svc-chk', target: 'pod-chk', type: 'selects' },
      { source: 'dep-chk', target: 'pod-chk', type: 'owns' },
      { source: 'dep-wh', target: 'pod-wh', type: 'owns' },
      { source: 'pod-wh', target: 'sec-stripe', type: 'mounts' },
      { source: 'np-pay', target: 'pod-chk', type: 'policy' },
    ],
    groups: [],
  },
  database: {
    nodes: [
      { id: 'svc-pg', kind: 'Service', name: 'postgres-svc', namespace: 'database', status: 'ClusterIP' },
      { id: 'sts-pg', kind: 'StatefulSet', name: 'postgres-primary', namespace: 'database', status: '1/1 Ready' },
      { id: 'pod-pg', kind: 'Pod', name: 'postgres-primary-0', namespace: 'database', status: 'Running' },
      { id: 'pvc-pg', kind: 'PersistentVolumeClaim', name: 'pg-data-0', namespace: 'database', status: 'Bound' },
    ],
    edges: [
      { source: 'svc-pg', target: 'pod-pg', type: 'selects' },
      { source: 'sts-pg', target: 'pod-pg', type: 'owns' },
      { source: 'pod-pg', target: 'pvc-pg', type: 'mounts' },
    ],
    groups: [],
  },
};

export const api = {
  // Auth
  getAuthSetupRequired: async () => ({ setup_required: false }),
  getAuthMe: async () => ({ user: getActiveUser() }),
  login: async ({ username }) => {
    setActiveDemoUser(username);
    return { user: getActiveUser() };
  },
  logout: async () => ({ ok: true }),

  // Config
  getConfig: async () => ({
    ai_enabled: true,
    ai_provider: 'copilot',
    features: {
      pod_monitoring: true,
      security_scan: true,
      diagram: true,
      ai_advice: true,
    },
  }),

  // Pods
  getFailedPods: async () => filterByUserNamespaces(mockFailedPods),
  getLivePods: async (namespace = null) => {
    let pods = filterByUserNamespaces(mockLivePods);
    if (namespace) pods = pods.filter((p) => p.namespace === namespace);
    const namespaces = Array.from(new Set(filterByUserNamespaces(mockLivePods).map((p) => p.namespace))).sort();
    return { pods, namespaces };
  },
  dismissPodFailure: async (id) => {
    const pod = mockFailedPods.find((p) => p.id === id);
    mockFailedPods = mockFailedPods.filter((p) => p.id !== id);
    recordDemoAudit('pod.dismiss', 'pod_failure', pod ? `${pod.namespace}/${pod.pod_name}` : String(id));
    return { ok: true };
  },
  retryPodSolution: async (id) => mockFailedPods.find((p) => p.id === id) || {},
  retrySolution: async (id) => mockFailedPods.find((p) => p.id === id) || {},
  troubleshootPod: async (id) => ({
    solution: 'AI Troubleshoot: Verified container exit code and events. Apply the recommended manifest patch and redeploy.',
    provider: 'copilot',
    model: 'openai/gpt-5.5-mini',
  }),
  getPodManifest: async (ns, name) => {
    const found = mockFailedPods.find((p) => p.namespace === ns && p.pod_name === name);
    return { manifest: found?.manifest || `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${name}\n  namespace: ${ns}` };
  },
  getPodLogs: async (ns, podName) => {
    const found = mockFailedPods.find((p) => p.namespace === ns && p.pod_name === podName);
    const live = mockLivePods.find((p) => p.namespace === ns && p.name === podName);
    const containers = live?.containers || found?.container_statuses?.map((c) => c.name) || ['app'];
    const sampleLogs = found?.logs || [
      `2026-11-27T12:10:01Z INFO  Starting ${podName} in namespace ${ns}...`,
      `2026-11-27T12:10:02Z INFO  Loaded configuration from /etc/app/config.yaml`,
      `2026-11-27T12:10:03Z INFO  Listening on :8080 (metrics on :9090)`,
      `2026-11-27T12:15:14Z INFO  GET /healthz 200 OK (1.2ms)`,
      `2026-11-27T12:18:42Z INFO  GET /api/v1/status 200 OK (3.8ms)`,
    ].join('\n');
    return {
      logs: sampleLogs,
      containers,
      container: containers[0],
    };
  },

  // Security Scanner
  getSecurityFindings: async () => ({ findings: filterByUserNamespaces(mockSecurityFindings) }),
  getSecurityFindingManifest: async (id) => {
    const f = mockSecurityFindings.find((item) => item.id === id);
    const kind = f?.resource_type || 'Deployment';
    const name = f?.resource_name || 'workload';
    const ns = f?.namespace || 'default';
    return {
      manifest: `apiVersion: apps/v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n  namespace: ${ns}\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n      - name: ${name}\n        image: ghcr.io/acme/${name}:v1.0.0\n        securityContext:\n          runAsNonRoot: false\n          readOnlyRootFilesystem: false\n          allowPrivilegeEscalation: true`,
    };
  },
  generateSecurityFix: async (id) => {
    const f = mockSecurityFindings.find((item) => item.id === id);
    const kind = f?.resource_type || 'Deployment';
    const name = f?.resource_name || 'workload';
    const ns = f?.namespace || 'default';
    return {
      fixed_manifest: `apiVersion: apps/v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n  namespace: ${ns}\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n      - name: ${name}\n        image: ghcr.io/acme/${name}:v1.0.0\n        securityContext:\n          runAsNonRoot: true\n          runAsUser: 1001\n          readOnlyRootFilesystem: true\n          allowPrivilegeEscalation: false\n          capabilities:\n            drop:\n            - ALL`,
      diff: [
        { type: 'unchanged', content: 'apiVersion: apps/v1' },
        { type: 'unchanged', content: `kind: ${kind}` },
        { type: 'unchanged', content: 'metadata:' },
        { type: 'unchanged', content: `  name: ${name}` },
        { type: 'unchanged', content: `  namespace: ${ns}` },
        { type: 'unchanged', content: 'spec:' },
        { type: 'unchanged', content: '  replicas: 2' },
        { type: 'unchanged', content: '  template:' },
        { type: 'unchanged', content: '    spec:' },
        { type: 'unchanged', content: '      containers:' },
        { type: 'unchanged', content: `      - name: ${name}` },
        { type: 'unchanged', content: `        image: ghcr.io/acme/${name}:v1.0.0` },
        { type: 'unchanged', content: '        securityContext:' },
        { type: 'removed', content: '          runAsNonRoot: false' },
        { type: 'removed', content: '          readOnlyRootFilesystem: false' },
        { type: 'removed', content: '          allowPrivilegeEscalation: true' },
        { type: 'added', content: '          runAsNonRoot: true' },
        { type: 'added', content: '          runAsUser: 1001' },
        { type: 'added', content: '          readOnlyRootFilesystem: true' },
        { type: 'added', content: '          allowPrivilegeEscalation: false' },
        { type: 'added', content: '          capabilities:' },
        { type: 'added', content: '            drop:' },
        { type: 'added', content: '            - ALL' },
      ],
      explanation: `Hardened securityContext for ${name} (${f?.rule_id || 'Security Rule'}): enforces non-root execution (UID 1001), read-only root filesystem, disables privilege escalation, and drops all Linux capabilities.`,
      is_fallback: false,
      provider: 'copilot',
      model: 'openai/gpt-5.5-mini',
    };
  },
  dismissSecurityFinding: async (id) => {
    mockSecurityFindings = mockSecurityFindings.map((f) => (f.id === id ? { ...f, dismissed: true } : f));
    recordDemoAudit('security_finding.dismiss', 'security_finding', String(id));
    return { ok: true };
  },
  restoreSecurityFinding: async (id) => {
    mockSecurityFindings = mockSecurityFindings.map((f) => (f.id === id ? { ...f, dismissed: false } : f));
    recordDemoAudit('security_finding.restore', 'security_finding', String(id));
    return { ok: true };
  },
  triggerSecurityRescan: async () => {
    recordDemoAudit('security.rescan', 'security_scan', 'cluster');
    return { status: 'started' };
  },

  // Diagram
  getDiagramNamespaces: async () => {
    const all = ['production', 'payments', 'database'];
    const u = getActiveUser();
    if (u.role === 'admin' || u.permissions?.all_namespaces) return { namespaces: all };
    const allowed = new Set(u.permissions?.namespaces || []);
    return { namespaces: all.filter((ns) => allowed.has(ns)) };
  },
  getDiagramNamespace: async (ns) => {
    const u = getActiveUser();
    if (u.role !== 'admin' && !u.permissions?.all_namespaces && !(u.permissions?.namespaces || []).includes(ns)) {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
    return NAMESPACE_DIAGRAMS[ns] || { nodes: [], edges: [], groups: [] };
  },
  getDiagramWorkloads: async (ns, kind) => {
    const d = NAMESPACE_DIAGRAMS[ns];
    if (!d) return { workloads: [] };
    return { workloads: d.nodes.filter((n) => n.kind === kind).map((n) => n.name) };
  },
  getDiagramWorkload: async (ns, kind, name) => {
    const d = NAMESPACE_DIAGRAMS[ns];
    const match = d?.nodes?.find((n) => n.kind === kind && n.name === name);
    if (!match) {
      const err = new Error('HTTP error! status: 404');
      err.status = 404;
      throw err;
    }
    return d;
  },
  getDiagramRoles: async () => ({ roles: [], cluster_roles: [] }),
  getResourceManifest: async (ns, kind, name) => ({
    manifest: `apiVersion: v1\nkind: ${kind}\nmetadata:\n  name: ${name}\n  namespace: ${ns}`,
  }),

  // AI Advice
  getAdviceFindings: async (params = {}) => {
    let filtered = filterByUserNamespaces(mockAdviceFindings);
    if (params.namespace) filtered = filtered.filter((f) => f.namespace === params.namespace);
    if (params.dismissed_only) filtered = filtered.filter((f) => f.dismissed);
    else if (!params.include_dismissed) filtered = filtered.filter((f) => !f.dismissed);
    return { findings: filtered };
  },
  getAdviceDetectors: async () => ({ detectors: [], hubble_status: { available: true } }),
  runAdviceScan: async () => ({ scan_id: 'demo-scan-1' }),
  dismissAdviceFinding: async (id) => {
    mockAdviceFindings = mockAdviceFindings.map((f) => (f.id === id ? { ...f, dismissed: true } : f));
    return { ok: true };
  },
  restoreAdviceFinding: async (id) => {
    mockAdviceFindings = mockAdviceFindings.map((f) => (f.id === id ? { ...f, dismissed: false } : f));
    return { ok: true };
  },
  explainAdviceFinding: async (id) => ({
    id,
    explanation: 'AI Explanation: Raising the memory limit and adding a PodDisruptionBudget prevents cascading restarts during traffic spikes.',
  }),
  downloadAdviceFindings: async () => {},

  // Mirrors (Test Fix)
  getActiveMirrors: async () => [],
  previewMirrorPod: async (podId) => {
    const pod = mockFailedPods.find((p) => p.id === podId) || mockFailedPods[0];
    const isOom = pod.failure_reason === 'OOMKilled';
    const fixedManifest = isOom
      ? `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${pod.pod_name}-mirror\n  namespace: ${pod.namespace}\nspec:\n  containers:\n  - name: webhook-worker\n    image: ghcr.io/acme/stripe-webhook:v1.8.2\n    resources:\n      requests:\n        memory: 256Mi\n      limits:\n        memory: 512Mi`
      : `apiVersion: v1\nkind: Pod\nmetadata:\n  name: ${pod.pod_name}-mirror\n  namespace: ${pod.namespace}\nspec:\n  containers:\n  - name: inventory-sync\n    image: ghcr.io/acme/inventory-sync:v2.1.0\n    env:\n    - name: API_TOKEN\n      valueFrom:\n        secretKeyRef:\n          name: api-auth-secret\n          key: token\n    resources:\n      requests:\n        cpu: 100m\n        memory: 128Mi`;
    return {
      fixed_manifest: fixedManifest,
      explanation: isOom
        ? 'Increased memory limit from 256Mi to 512Mi and set 256Mi request to prevent OOMKilled exits.'
        : 'Injected missing API_TOKEN from api-auth-secret so the container authenticates cleanly on startup.',
    };
  },
  deployMirrorPod: async () => {
    throw new Error('Mirror pod deployment is disabled in the interactive demo (read-only sandbox).');
  },
  getMirrorStatus: async () => ({ status: 'Running' }),
  deleteMirrorPod: async () => ({ ok: true }),

  // LLM Settings (Multi-LLM + Reasoning Effort + Proxy URL)
  getLLMStatus: async () => ({ configured: true, provider: 'copilot', model: 'openai/gpt-5.5-mini' }),
  getLLMConfigs: async () => ({ configs: mockLLMConfigs, default_config_id: mockLLMConfigs.find((c) => c.is_default)?.id || null }),
  getAvailableLLMs: async () => ({ configs: mockLLMConfigs }),
  createLLMConfig: async (payload) => {
    const item = { id: Date.now(), ...payload, is_active: true, created_at: nowIso(), updated_at: nowIso() };
    mockLLMConfigs = [...mockLLMConfigs, item];
    recordDemoAudit('llm_config.create', 'llm_config', item.name || item.provider);
    return item;
  },
  updateLLMConfig: async (id, payload) => {
    mockLLMConfigs = mockLLMConfigs.map((c) => (c.id === id ? { ...c, ...payload, updated_at: nowIso() } : c));
    recordDemoAudit('llm_config.update', 'llm_config', String(id));
    return mockLLMConfigs.find((c) => c.id === id);
  },
  deleteLLMConfig: async (id) => {
    mockLLMConfigs = mockLLMConfigs.filter((c) => c.id !== id);
    recordDemoAudit('llm_config.delete', 'llm_config', String(id));
    return { ok: true };
  },
  setDefaultLLMConfig: async (id) => {
    mockLLMConfigs = mockLLMConfigs.map((c) => ({ ...c, is_default: c.id === id }));
    recordDemoAudit('llm_config.set_default', 'llm_config', String(id));
    return { ok: true };
  },
  testLLMConfig: async () => ({ success: true, message: 'Demo connection succeeded!' }),
  getCustomInstructions: async () => ({ instructions: 'Always prefer Helm values.yaml diffs over raw kubectl patch commands.' }),
  updateCustomInstructions: async (instructions) => ({ instructions }),
  deleteCustomInstructions: async () => ({ instructions: '' }),

  // Admin: Teams, Users, SSO, Exclusions, Notifications
  getAllNamespaces: async () => ['production', 'payments', 'database', 'default'],
  getClusterNamespaces: async () => ['production', 'payments', 'database', 'default'],
  getTeams: async () => mockTeams,
  addTeamMember: async (teamId, userId) => {
    const u = Object.values(DEMO_USERS).find((usr) => usr.id === userId);
    if (u) {
      mockTeams = mockTeams.map((t) =>
        t.id === teamId && !t.members.some((m) => m.id === userId)
          ? { ...t, members: [...t.members, { id: u.id, username: u.username, email: u.email, role: u.role }] }
          : t
      );
    }
    return { ok: true };
  },
  removeTeamMember: async (teamId, userId) => {
    mockTeams = mockTeams.map((t) =>
      t.id === teamId ? { ...t, members: t.members.filter((m) => m.id !== userId) } : t
    );
    return { ok: true };
  },
  createTeam: async (payload) => {
    const t = { id: Date.now(), members: [], ...payload };
    mockTeams = [...mockTeams, t];
    recordDemoAudit('team.create', 'team', t.name);
    return t;
  },
  updateTeam: async (id, payload) => {
    mockTeams = mockTeams.map((t) => (t.id === id ? { ...t, ...payload } : t));
    recordDemoAudit('team.update', 'team', String(id));
    return mockTeams.find((t) => t.id === id);
  },
  deleteTeam: async (id) => {
    mockTeams = mockTeams.filter((t) => t.id !== id);
    recordDemoAudit('team.delete', 'team', String(id));
    return { ok: true };
  },
  getUsers: async () => Object.values(DEMO_USERS),
  getInvitations: async () => [],
  getAdminSSOConfig: async () => ({
    enabled: true,
    server_url: 'https://keycloak.corp.local',
    realm: 'kure-platform',
    client_id: 'kure-monitor',
    has_client_secret: true,
    admin_role: 'kure-admin',
    admin_group: '/platform-admins',
    allowed_groups: 'platform-admins,devops,sre',
    scopes: 'openid profile email',
    insecure_skip_tls_verify: false,
    source: 'database',
  }),
  updateAdminSSOConfig: async (cfg) => {
    recordDemoAudit('sso.update', 'sso_config', cfg.realm || 'keycloak', {
      enabled: cfg.enabled,
      server_url: cfg.server_url,
      realm: cfg.realm,
      client_secret: cfg.client_secret ? '[REDACTED]' : null,
    });
    return { ...cfg, has_client_secret: true, source: 'database' };
  },
  getSSOConfig: async () => ({ enabled: true, server_url: 'https://keycloak.corp.local', realm: 'kure-platform', client_id: 'kure-monitor', admin_role: 'kure-admin' }),
  saveSSOConfig: async (cfg) => cfg,
  getExcludedNamespaces: async () => [],
  getExcludedPods: async () => [],
  getExcludedRules: async () => [],
  getAllRuleTitles: async () => ['KSV013', 'KSV014', 'KSV111'],
  getMonitoredPods: async () => [],
  getTrustedRegistries: async () => ['ghcr.io/acme'],
  getNotificationSettings: async () => [
    { provider: 'slack', enabled: false, config: { webhook_url: '' } },
    { provider: 'teams', enabled: false, config: { webhook_url: '' } },
  ],

  // Audit Logs (Admin only)
  getAuditLogs: async ({ action = '', search = '', limit = 50, offset = 0 } = {}) => {
    let items = [...mockAuditLogs];
    if (action) items = items.filter((r) => r.action === action);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((r) =>
        `${r.actor_username} ${r.action} ${r.resource_type || ''} ${r.resource_name || ''}`.toLowerCase().includes(q)
      );
    }
    return { items: items.slice(offset, offset + limit), total: items.length };
  },
  getAuditRetention: async () => ({ retention_days: mockAuditRetentionDays }),
  updateAuditRetention: async (days) => {
    mockAuditRetentionDays = Number(days);
    recordDemoAudit('audit_retention.update', 'audit_settings', null, { retention_days: mockAuditRetentionDays });
    return { retention_days: mockAuditRetentionDays };
  },
  getAuditExportUrl: () => '#demo-export',
};
