import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Terminal, Search, RefreshCw, AlertCircle, Server } from 'lucide-react';
import { api } from '../services/api';
import PodLogsModal from './PodLogsModal';

const LivePodsTable = ({ isDark = false, userAllowedNamespaces = null, isAdmin = false }) => {
  const [pods, setPods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNamespace, setSelectedNamespace] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableNamespaces, setAvailableNamespaces] = useState([]);
  const [selectedLogPod, setSelectedLogPod] = useState(null);

  // Load allowed namespaces
  useEffect(() => {
    const loadNamespaces = async () => {
      try {
        const clusterNs = await api.getClusterNamespaces().catch(() => api.getAllNamespaces().catch(() => []));
        let permitted = clusterNs;
        if (!isAdmin && userAllowedNamespaces && userAllowedNamespaces.length > 0) {
          permitted = clusterNs.filter(ns => userAllowedNamespaces.includes(ns));
          if (permitted.length === 0) {
            permitted = userAllowedNamespaces;
          }
        }
        setAvailableNamespaces(permitted);
        if (permitted.length > 0 && !selectedNamespace) {
          if (!isAdmin && userAllowedNamespaces && userAllowedNamespaces.length > 0) {
            setSelectedNamespace(permitted[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load namespaces for live pods:', err);
      }
    };
    loadNamespaces();
  }, [isAdmin, userAllowedNamespaces]);

  const fetchLivePods = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await api.getLivePods(selectedNamespace);
      setPods(data.pods || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch live pods');
      setPods([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedNamespace]);

  useEffect(() => {
    fetchLivePods();
  }, [fetchLivePods]);

  // Filter pods by search query
  const filteredPods = useMemo(() => {
    if (!searchQuery.trim()) return pods;
    const q = searchQuery.toLowerCase().trim();
    return pods.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.namespace.toLowerCase().includes(q) ||
        (p.status_reason && p.status_reason.toLowerCase().includes(q))
    );
  }, [pods, searchQuery]);

  // Format age helper
  const getAge = (timestamp) => {
    if (!timestamp) return '-';
    const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  // Status badge styling
  const getStatusBadge = (statusReason, phase) => {
    const isRunning = phase === 'Running' && statusReason === 'Running';
    const isPending = phase === 'Pending' || statusReason === 'ContainerCreating';
    const isCompleted = phase === 'Succeeded' || statusReason === 'Completed';

    let colorClasses = isDark
      ? 'bg-red-900/40 text-red-300 border-red-700'
      : 'bg-red-50 text-red-700 border-red-200';

    if (isRunning) {
      colorClasses = isDark
        ? 'bg-green-900/40 text-green-300 border-green-700'
        : 'bg-green-50 text-green-700 border-green-200';
    } else if (isPending) {
      colorClasses = isDark
        ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700'
        : 'bg-yellow-50 text-yellow-700 border-yellow-200';
    } else if (isCompleted) {
      colorClasses = isDark
        ? 'bg-blue-900/40 text-blue-300 border-blue-700'
        : 'bg-blue-50 text-blue-700 border-blue-200';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${colorClasses}`}>
        {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />}
        {statusReason || phase}
      </span>
    );
  };

  return (
    <div className="p-4 space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Namespace Dropdown */}
          <div className="flex items-center space-x-2">
            <label className={`text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Namespace:
            </label>
            <select
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              className={`px-3 py-1.5 text-xs rounded-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              {(isAdmin || !userAllowedNamespaces || userAllowedNamespaces.length === 0) && (
                <option value="">All Namespaces</option>
              )}
              {availableNamespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pods..."
              className={`pl-8 pr-3 py-1.5 text-xs rounded-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 w-48 sm:w-64 ${
                isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>
        </div>

        {/* Refresh button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => fetchLivePods(true)}
            disabled={loading || refreshing}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${
              isDark
                ? 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className={`p-3 rounded-sm flex items-center space-x-2 text-xs ${isDark ? 'bg-red-900/30 text-red-300 border border-red-800' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table Content */}
      <div className={`border rounded-sm overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-left text-xs">
            <thead className={isDark ? 'bg-gray-750 text-gray-400' : 'bg-gray-50 text-gray-500'}>
              <tr>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider">Namespace</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider">Ready</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider">Restarts</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider">Age</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'bg-gray-800 divide-gray-700 text-gray-200' : 'bg-white divide-gray-200 text-gray-800'}`}>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-10">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading live pods...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredPods.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-12">
                    <Server className={`w-10 h-10 mx-auto mb-2 opacity-40`} />
                    <p className="font-medium text-sm">No live pods found</p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {searchQuery
                        ? `No pods matching "${searchQuery}"`
                        : selectedNamespace
                        ? `No pods running in namespace "${selectedNamespace}"`
                        : 'No pods found in the accessible namespaces'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPods.map((pod) => (
                  <tr
                    key={`${pod.namespace}/${pod.name}`}
                    className={`transition-colors cursor-pointer ${
                      isDark ? 'hover:bg-gray-700/60' : 'hover:bg-blue-50/50'
                    }`}
                    onClick={() => setSelectedLogPod(pod)}
                  >
                    <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Terminal className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-mono text-xs">{pod.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-mono ${
                        isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {pod.namespace}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono">{pod.ready}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{getStatusBadge(pod.status_reason, pod.phase)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono">
                      <span className={pod.restarts > 0 ? (isDark ? 'text-yellow-400 font-bold' : 'text-yellow-600 font-bold') : ''}>
                        {pod.restarts}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap font-mono text-gray-500 dark:text-gray-400">
                      {getAge(pod.created_at)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedLogPod(pod)}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          isDark
                            ? 'bg-gray-700 hover:bg-gray-600 text-blue-300 border-gray-600'
                            : 'bg-white hover:bg-gray-50 text-blue-600 border-gray-300'
                        }`}
                        title="View logs"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>Logs</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pod Logs Modal */}
      {selectedLogPod && (
        <PodLogsModal
          isOpen={Boolean(selectedLogPod)}
          onClose={() => setSelectedLogPod(null)}
          pod={selectedLogPod}
          isDark={isDark}
        />
      )}
    </div>
  );
};

export default LivePodsTable;
