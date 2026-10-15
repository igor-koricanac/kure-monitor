import React, { useState, useCallback } from 'react';
import { AlertCircle, CheckCircle, Bot, Bell, EyeOff, Settings, Users, Mail, KeyRound } from 'lucide-react';
import NotificationSettings from './NotificationSettings';
import LLMSettings from './LLMSettings';
import ExclusionNamespaces from './admin/ExclusionNamespaces';
import ExclusionPods from './admin/ExclusionPods';
import ExclusionRules from './admin/ExclusionRules';
import ExclusionRegistries from './admin/ExclusionRegistries';
import RetentionSettings from './admin/RetentionSettings';
import AdviceDetectorSettings from './admin/AdviceDetectorSettings';
import UsersManager from './admin/UsersManager';
import InvitationsManager from './admin/InvitationsManager';
import TeamSettings from './admin/TeamSettings';
import SSOSettings from './admin/SSOSettings';

const AdminPanel = ({ isDark = false, onConfigChange }) => {
  // Tab state
  const [activeTab, setActiveTab] = useState('settings');
  const [settingsSubTab, setSettingsSubTab] = useState('access');
  const [accessSubTab, setAccessSubTab] = useState('users');

  // Error/success messages displayed at the top level
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const tabs = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'ai', label: 'AI Config', icon: Bot },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'exclusions', label: 'Suppressions', icon: EyeOff },
  ];

  const settingsSubTabs = [
    { id: 'access', label: 'Users & Teams', icon: Users },
    { id: 'sso', label: 'SSO / Keycloak', icon: KeyRound },
    { id: 'retention', label: 'Retention & Limits', icon: Settings },
    { id: 'detectors', label: 'Advice Detectors', icon: Settings },
  ];

  const accessSubTabs = [
    { id: 'users', label: 'Users', icon: Users },
    { id: 'teams', label: 'Teams', icon: Users },
    { id: 'invitations', label: 'Invitations', icon: Mail },
  ];

  const handleSuccess = useCallback((message) => {
    setError(null);
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  const handleError = useCallback((message) => {
    setError(message);
  }, []);

  return (
    <div className="p-6">
      {/* Top Level Tab Navigation */}
      <div className={`flex border-b mb-6 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? isDark
                    ? 'border-blue-500 text-blue-400'
                    : 'border-blue-600 text-blue-600'
                  : isDark
                    ? 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className={`border rounded-sm p-3 mb-4 ${isDark ? 'bg-red-900/30 border-red-800' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center">
            <AlertCircle className="w-4 h-4 text-red-500 mr-2" />
            <span className={`text-sm ${isDark ? 'text-red-300' : 'text-red-800'}`}>{error}</span>
          </div>
        </div>
      )}

      {successMessage && (
        <div className={`border rounded-sm p-3 mb-4 ${isDark ? 'bg-green-900/30 border-green-800' : 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center">
            <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
            <span className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'}`}>{successMessage}</span>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'settings' && (
        <div>
          {/* Settings Sub-Tabs Navigation */}
          <div className={`flex space-x-2 border-b mb-6 pb-2 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            {settingsSubTabs.map((subTab) => {
              const Icon = subTab.icon;
              const isActive = settingsSubTab === subTab.id;
              return (
                <button
                  key={subTab.id}
                  onClick={() => setSettingsSubTab(subTab.id)}
                  className={`flex items-center px-3 py-1.5 text-xs sm:text-sm font-medium rounded-sm transition-colors ${
                    isActive
                      ? isDark
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-600 text-white'
                      : isDark
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {subTab.label}
                </button>
              );
            })}
          </div>

          {/* Settings Sub-Tab: Users & Teams */}
          {settingsSubTab === 'access' && (
            <div>
              {/* Nested Pills for Users, Teams, Invitations */}
              <div className="flex space-x-2 mb-6">
                {accessSubTabs.map((pill) => {
                  const Icon = pill.icon;
                  const isPillActive = accessSubTab === pill.id;
                  return (
                    <button
                      key={pill.id}
                      onClick={() => setAccessSubTab(pill.id)}
                      className={`flex items-center px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                        isPillActive
                          ? isDark
                            ? 'bg-blue-900/40 border-blue-500 text-blue-300'
                            : 'bg-blue-50 border-blue-500 text-blue-700'
                          : isDark
                            ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
                            : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800'
                      }`}
                    >
                      <Icon className="w-3 h-3 mr-1.5" />
                      {pill.label}
                    </button>
                  );
                })}
              </div>

              {accessSubTab === 'users' && (
                <UsersManager isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
              )}
              {accessSubTab === 'teams' && (
                <TeamSettings isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
              )}
              {accessSubTab === 'invitations' && (
                <InvitationsManager isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
              )}
            </div>
          )}

          {/* Settings Sub-Tab: SSO / Keycloak */}
          {settingsSubTab === 'sso' && (
            <SSOSettings isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
          )}

          {/* Settings Sub-Tab: Retention & Limits */}
          {settingsSubTab === 'retention' && (
            <RetentionSettings isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
          )}

          {/* Settings Sub-Tab: Advice Detectors */}
          {settingsSubTab === 'detectors' && (
            <AdviceDetectorSettings isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
          )}
        </div>
      )}

      {activeTab === 'ai' && <LLMSettings isDark={isDark} onConfigChange={onConfigChange} />}

      {activeTab === 'notifications' && <NotificationSettings isDark={isDark} />}

      {activeTab === 'exclusions' && (
        <div className="space-y-8">
          <ExclusionNamespaces isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
          <ExclusionPods isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
          <ExclusionRules isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
          <ExclusionRegistries isDark={isDark} onError={handleError} onSuccess={handleSuccess} />
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
