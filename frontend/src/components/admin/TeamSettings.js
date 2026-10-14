import React, { useState, useEffect, useCallback } from 'react';
import { Users as UsersIcon, Plus, Trash2, Edit2, Shield, Folder, Eye, Check, X } from 'lucide-react';
import { api } from '../../services/api';

const AVAILABLE_TABS = [
  { id: 'pod_monitoring', label: 'Pod Monitoring' },
  { id: 'security_scanner', label: 'Security Scan' },
  { id: 'diagram', label: 'Diagram' },
  { id: 'ai_advice', label: 'AI Advice' },
];

const TeamSettings = ({ isDark, onError, onSuccess }) => {
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accessLevel, setAccessLevel] = useState('read');
  const [allNamespaces, setAllNamespaces] = useState(false);
  const [selectedTabs, setSelectedTabs] = useState(['pod_monitoring']);
  const [namespacesInput, setNamespacesInput] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [teamsData, usersData] = await Promise.all([
        api.getTeams(),
        api.getUsers(),
      ]);
      setTeams(teamsData);
      setUsers(usersData);
    } catch (err) {
      onError?.('Failed to load teams or users');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingTeam(null);
    setName('');
    setDescription('');
    setAccessLevel('read');
    setAllNamespaces(false);
    setSelectedTabs(['pod_monitoring']);
    setNamespacesInput('');
    setSelectedMemberIds([]);
    setIsModalOpen(true);
  };

  const openEditModal = (team) => {
    setEditingTeam(team);
    setName(team.name);
    setDescription(team.description || '');
    setAccessLevel(team.access_level);
    setAllNamespaces(team.all_namespaces);
    setSelectedTabs(team.tabs || []);
    setNamespacesInput((team.namespaces || []).join(', '));
    setSelectedMemberIds((team.members || []).map((m) => m.id));
    setIsModalOpen(true);
  };

  const handleTabToggle = (tabId) => {
    setSelectedTabs((prev) =>
      prev.includes(tabId) ? prev.filter((t) => t !== tabId) : [...prev, tabId]
    );
  };

  const handleMemberToggle = (userId) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      onError?.('Team name is required');
      return;
    }

    const namespacesList = namespacesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      if (editingTeam) {
        await api.updateTeam(editingTeam.id, {
          name: name.trim(),
          description: description.trim() || null,
          access_level: accessLevel,
          all_namespaces: allNamespaces,
          tabs: selectedTabs,
          namespaces: namespacesList,
        });

        // Sync members
        const currentMemberIds = (editingTeam.members || []).map((m) => m.id);
        const toAdd = selectedMemberIds.filter((id) => !currentMemberIds.includes(id));
        const toRemove = currentMemberIds.filter((id) => !selectedMemberIds.includes(id));

        for (const uid of toAdd) {
          await api.addTeamMember(editingTeam.id, uid);
        }
        for (const uid of toRemove) {
          await api.removeTeamMember(editingTeam.id, uid);
        }

        onSuccess?.(`Team "${name}" updated successfully`);
      } else {
        await api.createTeam({
          name: name.trim(),
          description: description.trim() || null,
          access_level: accessLevel,
          all_namespaces: allNamespaces,
          tabs: selectedTabs,
          namespaces: namespacesList,
          member_ids: selectedMemberIds,
        });
        onSuccess?.(`Team "${name}" created successfully`);
      }
      setIsModalOpen(false);
      await fetchData();
    } catch (err) {
      onError?.(err?.message || 'Failed to save team');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (team) => {
    if (!window.confirm(`Delete team "${team.name}"? Members will lose permissions associated with this team.`)) return;
    try {
      await api.deleteTeam(team.id);
      onSuccess?.(`Team "${team.name}" deleted`);
      await fetchData();
    } catch (err) {
      onError?.(err?.message || 'Failed to delete team');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className={`p-2 rounded-sm mr-3 ${isDark ? 'bg-blue-900/50' : 'bg-blue-100'}`}>
            <UsersIcon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div>
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Teams</h3>
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Organize users into teams and assign granular RBAC (namespaces, tabs, read/write permissions).
            </p>
          </div>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center px-3 py-2 text-sm font-medium rounded-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Create Team
        </button>
      </div>

      {loading ? (
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading teams...</p>
      ) : teams.length === 0 ? (
        <div className={`p-8 text-center rounded-sm border ${isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50'}`}>
          <p className={`text-sm mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No teams created yet. Users without a team will see an empty access state until assigned.
          </p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-sm bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add First Team
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((team) => (
            <div
              key={team.id}
              className={`p-4 rounded-sm border ${
                isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
              } flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {team.name}
                    </h4>
                    {team.description && (
                      <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {team.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openEditModal(team)}
                      className={`p-1.5 rounded transition-colors ${
                        isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                      }`}
                      title="Edit team"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(team)}
                      className={`p-1.5 rounded transition-colors ${
                        isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50'
                      }`}
                      title="Delete team"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  {/* Access Level */}
                  <div className="flex items-center text-xs">
                    <Shield className="w-3.5 h-3.5 mr-2 text-gray-400" />
                    <span className={`font-medium mr-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                      Access:
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-medium ${
                        team.access_level === 'write'
                          ? isDark
                            ? 'bg-amber-900/50 text-amber-300'
                            : 'bg-amber-100 text-amber-800'
                          : isDark
                          ? 'bg-gray-700 text-gray-300'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {team.access_level.toUpperCase()}
                    </span>
                  </div>

                  {/* Namespaces */}
                  <div className="flex items-start text-xs">
                    <Folder className="w-3.5 h-3.5 mr-2 mt-0.5 text-gray-400 shrink-0" />
                    <div>
                      <span className={`font-medium mr-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Namespaces:
                      </span>
                      {team.all_namespaces ? (
                        <span className={`italic ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>All Namespaces</span>
                      ) : team.namespaces?.length > 0 ? (
                        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                          {team.namespaces.join(', ')}
                        </span>
                      ) : (
                        <span className={`italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>None selected</span>
                      )}
                    </div>
                  </div>

                  {/* Allowed Tabs */}
                  <div className="flex items-start text-xs">
                    <Eye className="w-3.5 h-3.5 mr-2 mt-0.5 text-gray-400 shrink-0" />
                    <div>
                      <span className={`font-medium mr-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Visible Tabs:
                      </span>
                      <div className="inline-flex flex-wrap gap-1 mt-0.5">
                        {team.tabs?.length > 0 ? (
                          team.tabs.map((tab) => {
                            const label = AVAILABLE_TABS.find((t) => t.id === tab)?.label || tab;
                            return (
                              <span
                                key={tab}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                                  isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'
                                }`}
                              >
                                {label}
                              </span>
                            );
                          })
                        ) : (
                          <span className={`italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No tabs</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Members */}
                  <div className="flex items-start text-xs pt-1">
                    <UsersIcon className="w-3.5 h-3.5 mr-2 mt-0.5 text-gray-400 shrink-0" />
                    <div>
                      <span className={`font-medium mr-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        Members ({team.members?.length || 0}):
                      </span>
                      {team.members?.length > 0 ? (
                        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                          {team.members.map((m) => m.username).join(', ')}
                        </span>
                      ) : (
                        <span className={`italic ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No members</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-xl rounded-sm p-6 shadow-xl border ${
              isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {editingTeam ? `Edit Team: ${editingTeam.name}` : 'Create New Team'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className={`p-1 rounded ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Team Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Frontend Engineers"
                  className={`w-full px-3 py-2 text-sm rounded-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of the team's scope"
                  className={`w-full px-3 py-2 text-sm rounded-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                  }`}
                />
              </div>

              {/* Access Level */}
              <div>
                <label className={`block text-xs font-semibold mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Access Level
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="accessLevel"
                      value="read"
                      checked={accessLevel === 'read'}
                      onChange={(e) => setAccessLevel(e.target.value)}
                      className="mr-2 text-blue-600"
                    />
                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Read-Only</span>
                  </label>
                  <label className="flex items-center text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="accessLevel"
                      value="write"
                      checked={accessLevel === 'write'}
                      onChange={(e) => setAccessLevel(e.target.value)}
                      className="mr-2 text-blue-600"
                    />
                    <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>
                      Write (troubleshoot, remediate, dismiss)
                    </span>
                  </label>
                </div>
              </div>

              {/* Namespaces */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={`block text-xs font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                    Kubernetes Namespaces
                  </label>
                  <label className="flex items-center text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allNamespaces}
                      onChange={(e) => setAllNamespaces(e.target.checked)}
                      className="mr-1.5 rounded text-blue-600"
                    />
                    <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>All Namespaces</span>
                  </label>
                </div>
                {!allNamespaces && (
                  <input
                    type="text"
                    value={namespacesInput}
                    onChange={(e) => setNamespacesInput(e.target.value)}
                    placeholder="e.g. default, staging, payments (comma separated)"
                    className={`w-full px-3 py-2 text-sm rounded-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  />
                )}
              </div>

              {/* Visible Tabs */}
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Allowed Dashboard Tabs
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {AVAILABLE_TABS.map((tab) => {
                    const isChecked = selectedTabs.includes(tab.id);
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleTabToggle(tab.id)}
                        className={`flex items-center justify-between px-3 py-2 text-xs rounded-sm border transition-colors ${
                          isChecked
                            ? isDark
                              ? 'bg-blue-900/40 border-blue-600 text-blue-200'
                              : 'bg-blue-50 border-blue-400 text-blue-800'
                            : isDark
                            ? 'bg-gray-700/50 border-gray-600 text-gray-300 hover:bg-gray-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {isChecked && <Check className="w-3.5 h-3.5 text-blue-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Members */}
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Assign Team Members
                </label>
                <div
                  className={`max-h-40 overflow-y-auto p-2 rounded-sm border divide-y ${
                    isDark
                      ? 'bg-gray-700/50 border-gray-600 divide-gray-600'
                      : 'bg-gray-50 border-gray-200 divide-gray-200'
                  }`}
                >
                  {users.length === 0 ? (
                    <p className={`text-xs p-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No users available</p>
                  ) : (
                    users.map((u) => {
                      const isSelected = selectedMemberIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex items-center justify-between py-1.5 px-1 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleMemberToggle(u.id)}
                              className="mr-2.5 rounded text-blue-600"
                            />
                            <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {u.username}
                            </span>
                            {u.role === 'admin' && (
                              <span
                                className={`ml-2 text-[10px] px-1 py-0.2 rounded font-semibold ${
                                  isDark ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                admin
                              </span>
                            )}
                          </div>
                          <span className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {u.email || ''}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className={`px-4 py-2 text-xs font-medium rounded-sm border ${
                    isDark
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium rounded-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingTeam ? 'Update Team' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamSettings;
