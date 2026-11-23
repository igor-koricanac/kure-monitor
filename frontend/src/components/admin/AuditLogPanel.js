import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Search, Download, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'pod.dismiss', label: 'Pod Failure Dismissed' },
  { value: 'mirror.deploy', label: 'Mirror Pod Deployed' },
  { value: 'mirror.delete', label: 'Mirror Pod Deleted' },
  { value: 'llm_config.create', label: 'LLM Config Created' },
  { value: 'llm_config.update', label: 'LLM Config Updated' },
  { value: 'llm_config.delete', label: 'LLM Config Deleted' },
  { value: 'llm_config.set_default', label: 'LLM Default Changed' },
  { value: 'llm_instructions.update', label: 'LLM Instructions Updated' },
  { value: 'security_finding.dismiss', label: 'Security Finding Dismissed' },
  { value: 'security_finding.restore', label: 'Security Finding Restored' },
  { value: 'security.rescan', label: 'Security Rescan Triggered' },
  { value: 'trusted_registry.add', label: 'Trusted Registry Added' },
  { value: 'trusted_registry.remove', label: 'Trusted Registry Removed' },
  { value: 'excluded_namespace.add', label: 'Excluded Namespace Added' },
  { value: 'excluded_namespace.remove', label: 'Excluded Namespace Removed' },
  { value: 'excluded_pod.add', label: 'Excluded Pod Added' },
  { value: 'excluded_pod.remove', label: 'Excluded Pod Removed' },
  { value: 'excluded_rule.add', label: 'Excluded Rule Added' },
  { value: 'excluded_rule.remove', label: 'Excluded Rule Removed' },
  { value: 'advice_finding.dismiss', label: 'Advice Finding Dismissed' },
  { value: 'advice_finding.restore', label: 'Advice Finding Restored' },
  { value: 'advice_detector.update', label: 'Advice Detector Updated' },
  { value: 'advice.scan', label: 'Advice Scan Triggered' },
  { value: 'notification.save', label: 'Notification Saved' },
  { value: 'notification.update', label: 'Notification Updated' },
  { value: 'notification.delete', label: 'Notification Deleted' },
  { value: 'sso.update', label: 'SSO Config Updated' },
  { value: 'auth.login', label: 'Login Success' },
  { value: 'auth.login_failed', label: 'Login Failed' },
  { value: 'auth.logout', label: 'Logout' },
  { value: 'user.invite', label: 'User Invited' },
  { value: 'user.update_role', label: 'User Role Updated' },
  { value: 'user.delete', label: 'User Deleted' },
  { value: 'team.create', label: 'Team Created' },
  { value: 'team.update', label: 'Team Updated' },
  { value: 'team.delete', label: 'Team Deleted' },
  { value: 'team_member.add', label: 'Team Member Added' },
  { value: 'team_member.remove', label: 'Team Member Removed' },
];

const RETENTION_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '365 days' },
];

const PAGE_SIZE = 50;

const AuditLogPanel = ({ isDark = false, onError, onSuccess, auditEvent = null }) => {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [retentionDays, setRetentionDays] = useState(90);
  const [savingRetention, setSavingRetention] = useState(false);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getAuditLogs({
        action: actionFilter,
        search: search.trim(),
        limit: PAGE_SIZE,
        offset,
      });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
    } catch (err) {
      if (onError) onError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [actionFilter, search, offset, onError]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Live WebSocket updates for new audit entries
  useEffect(() => {
    const entry = auditEvent?.data;
    if (!entry || !entry.action) return;
    if (actionFilter && entry.action !== actionFilter) return;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${entry.actor_username || ''} ${entry.action || ''} ${entry.resource_type || ''} ${entry.resource_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return;
    }
    setTotal((prev) => prev + 1);
    if (offset === 0) {
      setItems((prev) => {
        if (entry.id != null && prev.some((r) => r.id === entry.id)) return prev;
        return [entry, ...prev].slice(0, PAGE_SIZE);
      });
    }
  }, [auditEvent, actionFilter, search, offset]);

  useEffect(() => {
    api.getAuditRetention()
      .then((res) => {
        if (res?.retention_days) setRetentionDays(res.retention_days);
      })
      .catch(() => {});
  }, []);

  const handleRetentionChange = async (e) => {
    const days = Number(e.target.value);
    setRetentionDays(days);
    try {
      setSavingRetention(true);
      await api.updateAuditRetention(days);
      if (onSuccess) onSuccess(`Audit log retention updated to ${days} days`);
    } catch (err) {
      if (onError) onError(err.message || 'Failed to update retention');
    } finally {
      setSavingRetention(false);
    }
  };

  const handleExport = (format) => {
    const url = api.getAuditExportUrl({
      format,
      action: actionFilter,
      search: search.trim(),
    });
    window.open(url, '_blank', 'noopener');
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-4" data-testid="audit-log-panel">
      {/* Header + Retention + Export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-500" />
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Audit Log
            </h2>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Immutable trail of administrative and user mutations (Admin only).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Retention:
          </label>
          <select
            value={retentionDays}
            onChange={handleRetentionChange}
            disabled={savingRetention}
            data-testid="audit-retention-select"
            className={`px-2 py-1.5 text-xs border rounded-sm ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`}
          >
            {RETENTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-sm ${isDark ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-sm ${isDark ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <Download className="w-3.5 h-3.5" /> JSON
          </button>
          <button
            type="button"
            onClick={loadLogs}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border rounded-sm ${isDark ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className={`w-4 h-4 absolute left-2.5 top-2.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            placeholder="Search actor, action, or resource..."
            className={`w-full pl-8 pr-3 py-1.5 text-sm border rounded-sm ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'}`}
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
          className={`px-3 py-1.5 text-sm border rounded-sm ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'}`}
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className={`border rounded-sm overflow-x-auto ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <table className="min-w-full text-left text-xs">
          <thead className={isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'}>
            <tr>
              <th className="px-3 py-2 w-6"></th>
              <th className="px-3 py-2">Timestamp</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Resource</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">IP</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-gray-700 text-gray-200' : 'divide-gray-200 text-gray-800'}`}>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading audit logs...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No audit log entries found.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const isExpanded = expandedId === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      className={`cursor-pointer ${isDark ? 'hover:bg-gray-800/60' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-3 py-2 text-gray-400">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono">
                        {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium">{row.actor_username}</span>
                        {row.actor_role && (
                          <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                            {row.actor_role}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-blue-500">
                        {row.action}
                      </td>
                      <td className="px-3 py-2">
                        {row.resource_type ? `${row.resource_type}${row.resource_name ? `: ${row.resource_name}` : ''}` : '-'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            row.status === 'success'
                              ? isDark ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800'
                              : isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-400">
                        {row.ip_address || '-'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={isDark ? 'bg-gray-900/60' : 'bg-gray-50/80'}>
                        <td colSpan={7} className="px-6 py-3">
                          <pre className={`text-xs font-mono overflow-x-auto p-2 rounded ${isDark ? 'bg-gray-950 text-gray-300' : 'bg-white border border-gray-200 text-gray-700'}`}>
                            {JSON.stringify(row.details || {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Showing {items.length} of {total} entries</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-2.5 py-1 border rounded-sm disabled:opacity-40"
          >
            Previous
          </button>
          <span>Page {currentPage} of {totalPages}</span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-2.5 py-1 border rounded-sm disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditLogPanel;
