import React, { useState, useEffect } from 'react';
import { Save, FlaskConical } from 'lucide-react';
import { api } from '../../services/api';

const RetentionSettings = ({ isDark, onError, onSuccess }) => {
  // Mirror Pod TTL state (stored as seconds in backend)
  const [mirrorTTL, setMirrorTTL] = useState(180);
  const [mirrorTTLDirty, setMirrorTTLDirty] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const mirrorTTLData = await api.getMirrorTTL().catch(() => ({ seconds: 180 }));
        setMirrorTTL(mirrorTTLData.seconds || 180);
        setMirrorTTLDirty(false);
      } catch (err) {
        onError('Failed to load settings');
        console.error('Error loading settings:', err);
      }
    };
    loadData();
  }, [onError]);

  const handleMirrorTTLSave = async (seconds) => {
    try {
      if (seconds < 30 || seconds > 600) {
        onError('Mirror Pod TTL must be between 30 and 600 seconds');
        return;
      }
      await api.setMirrorTTL(seconds);
      onSuccess(`Mirror Pod TTL set to ${seconds} seconds.`);
      setMirrorTTLDirty(false);
    } catch (err) {
      onError('Failed to update Mirror Pod TTL');
      console.error('Error updating mirror TTL:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Mirror Pod TTL */}
      <div>
        <div className="mb-4 flex items-center">
          <FlaskConical className="w-5 h-5 text-blue-500 mr-2" />
          <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Mirror Pod TTL</h2>
        </div>
        <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          How long temporary mirror pods live before auto-deletion. Mirror pods are used to test AI-generated fixes.
        </p>

        <div className="flex items-center gap-4">
          <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            TTL (seconds)
          </label>

          <input
            type="number"
            min={30}
            max={600}
            value={mirrorTTL}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 30;
              setMirrorTTL(val);
              setMirrorTTLDirty(true);
            }}
            onBlur={() => {
              const clamped = Math.max(30, Math.min(mirrorTTL, 600));
              setMirrorTTL(clamped);
            }}
            className={`w-24 px-3 py-2 text-sm border rounded-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
              isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-900'
            }`}
          />

          {mirrorTTLDirty && (
            <button
              onClick={() => {
                const clamped = Math.max(30, Math.min(mirrorTTL, 600));
                setMirrorTTL(clamped);
                handleMirrorTTLSave(clamped);
              }}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-sm shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <Save className="w-4 h-4 mr-1" />
              Save
            </button>
          )}
        </div>

        <div className={`mt-3 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Valid range: 30 - 600 seconds. Default: 180 seconds (3 minutes).
        </div>
      </div>
    </div>
  );
};

export default RetentionSettings;
