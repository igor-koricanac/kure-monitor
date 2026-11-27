import React, { useState, useEffect } from 'react';
import { KeyRound, Save, AlertCircle, Info, Lock } from 'lucide-react';
import { api } from '../../services/api';

const SSOSettings = ({ isDark, onError, onSuccess }) => {
  const [config, setConfig] = useState({
    enabled: false,
    server_url: '',
    realm: '',
    client_id: '',
    client_secret: '',
    admin_role: 'kure-admin',
    admin_group: '',
    allowed_groups: '',
    scopes: 'openid profile email',
    insecure_skip_tls_verify: false,
    source: 'none',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.getAdminSSOConfig()
      .then((data) => {
        if (mounted && data) {
          setConfig({
            enabled: !!data.enabled,
            server_url: data.server_url || '',
            realm: data.realm || '',
            client_id: data.client_id || '',
            client_secret: data.client_secret || '',
            admin_role: data.admin_role || 'kure-admin',
            admin_group: data.admin_group || '',
            allowed_groups: data.allowed_groups || '',
            scopes: data.scopes || 'openid profile email',
            insecure_skip_tls_verify: !!data.insecure_skip_tls_verify,
            source: data.source || 'none',
          });
        }
      })
      .catch((err) => {
        if (mounted) onError(err?.message || 'Failed to load SSO configuration');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [onError]);

  const handleChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (config.source === 'env') return;

    setSaving(true);
    try {
      const res = await api.updateAdminSSOConfig({
        enabled: config.enabled,
        server_url: config.server_url,
        realm: config.realm,
        client_id: config.client_id,
        client_secret: config.client_secret,
        admin_role: config.admin_role,
        admin_group: config.admin_group,
        allowed_groups: config.allowed_groups,
        scopes: config.scopes,
        insecure_skip_tls_verify: config.insecure_skip_tls_verify,
      });
      setConfig((prev) => ({
        ...prev,
        ...res,
      }));
      setDirty(false);
      onSuccess('Keycloak SSO configuration saved successfully');
    } catch (err) {
      onError(err?.message || 'Failed to save SSO configuration');
    } finally {
      setSaving(false);
    }
  };

  const isEnvManaged = config.source === 'env';

  if (loading) {
    return (
      <div className={`p-6 border rounded-sm ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center space-x-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded animate-spin" />
          <span>Loading Keycloak SSO configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-sm p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <KeyRound className="w-5 h-5 text-blue-500" />
          <div>
            <h3 className={`text-base font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              Keycloak SSO (OpenID Connect)
            </h3>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Allow users to authenticate using Keycloak realm credentials.
            </p>
          </div>
        </div>

        {isEnvManaged && (
          <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
            <Lock className="w-3 h-3 mr-1" />
            Configured via Helm / Environment
          </span>
        )}
      </div>

      {isEnvManaged && (
        <div className={`mb-6 p-3 rounded-sm border flex items-start space-x-2 text-xs ${
          isDark ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            SSO configuration is currently supplied via Helm chart values (<code className="font-mono">keycloak.*</code>) or environment variables. UI changes are disabled to keep configuration state in sync with deployment declarations.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Enable Switch */}
        <div className="flex items-center justify-between py-2">
          <div>
            <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              Enable Keycloak SSO
            </label>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              When enabled, a &ldquo;Sign in with Keycloak&rdquo; button will appear on the login page.
            </p>
          </div>
          <button
            type="button"
            disabled={isEnvManaged}
            onClick={() => handleChange('enabled', !config.enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              config.enabled ? 'bg-blue-600' : isDark ? 'bg-gray-600' : 'bg-gray-200'
            } ${isEnvManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Server URL */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Keycloak Server URL
            </label>
            <input
              type="url"
              disabled={isEnvManaged}
              value={config.server_url}
              onChange={(e) => handleChange('server_url', e.target.value)}
              placeholder="https://keycloak.example.com"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Base URL of Keycloak instance (e.g. without <code className="font-mono">/realms/...</code>).
            </p>
          </div>

          {/* Realm */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Realm Name
            </label>
            <input
              type="text"
              disabled={isEnvManaged}
              value={config.realm}
              onChange={(e) => handleChange('realm', e.target.value)}
              placeholder="kure"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Client ID */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Client ID
            </label>
            <input
              type="text"
              disabled={isEnvManaged}
              value={config.client_id}
              onChange={(e) => handleChange('client_id', e.target.value)}
              placeholder="kure-monitor"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Client Secret
            </label>
            <input
              type="password"
              disabled={isEnvManaged}
              value={config.client_secret}
              onChange={(e) => handleChange('client_secret', e.target.value)}
              placeholder={config.client_secret ? '••••••••' : 'Enter client secret'}
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Admin Role Mapping */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Admin Role Name
            </label>
            <input
              type="text"
              disabled={isEnvManaged}
              value={config.admin_role}
              onChange={(e) => handleChange('admin_role', e.target.value)}
              placeholder="kure-admin"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Keycloak realm role granting admin privileges in Kure Monitor.
            </p>
          </div>

          {/* Admin Group Mapping */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Admin Group Name (Optional)
            </label>
            <input
              type="text"
              disabled={isEnvManaged}
              value={config.admin_group || ''}
              onChange={(e) => handleChange('admin_group', e.target.value)}
              placeholder="kure-admin or /admins"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Keycloak group granting admin privileges in Kure Monitor.
            </p>
          </div>

          {/* Allowed Groups (Gatekeeper) */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Allowed Groups (Optional)
            </label>
            <input
              type="text"
              disabled={isEnvManaged}
              value={config.allowed_groups || ''}
              onChange={(e) => handleChange('allowed_groups', e.target.value)}
              placeholder="developers, devops, platform"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
            <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Comma-separated. If set, only users in at least one of these groups can sign in. Leave empty to allow any realm user.
            </p>
          </div>

          {/* Scopes */}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              OAuth Scopes
            </label>
            <input
              type="text"
              disabled={isEnvManaged}
              value={config.scopes}
              onChange={(e) => handleChange('scopes', e.target.value)}
              placeholder="openid profile email"
              className={`w-full px-3 py-2 text-sm border rounded-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } ${isEnvManaged ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>

          {/* Insecure Skip TLS Verify */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Skip TLS Verification
              </label>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Disable SSL certificate validation when communicating with Keycloak (useful for internal CAs or self-signed certs).
              </p>
            </div>
            <button
              type="button"
              disabled={isEnvManaged}
              onClick={() => handleChange('insecure_skip_tls_verify', !config.insecure_skip_tls_verify)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                config.insecure_skip_tls_verify ? 'bg-amber-600' : isDark ? 'bg-gray-600' : 'bg-gray-200'
              } ${isEnvManaged ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  config.insecure_skip_tls_verify ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Callback URI note */}
        <div className={`mt-4 p-3 rounded-sm text-xs ${isDark ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>
          <span className="font-semibold">Valid Redirect URI in Keycloak:</span>{' '}
          <code className="font-mono">{window.location.origin}/api/auth/sso/callback</code>
        </div>

        {!isEnvManaged && (
          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={saving || !dirty}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white rounded-sm transition-colors ${
                saving || !dirty
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Save Configuration</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default SSOSettings;
