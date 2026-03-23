import React, { useState, useEffect } from 'react';
import { withAuth } from '@/lib/withAuth';
import { useSupabase } from '@/lib/supabase';
import Icon from '../../../components/AppIcon';
import { Button } from '@/components/ui/button';

const PreferencesSettings = ({ user }) => {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preferences, setPreferences] = useState({
    notifications: {
      boardInvites: true,
      newComments: true,
      boardUpdates: false,
      weeklyDigest: true,
      emailNotifications: true,
      pushNotifications: false
    },
    language: 'en',
    theme: 'auto',
    emailFrequency: 'daily'
  });
  const [originalPreferences, setOriginalPreferences] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
    { value: 'pt', label: 'Português' },
    { value: 'zh', label: '中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' }
  ];

  const themes = [
    { value: 'light', label: 'Light', icon: 'Sun' },
    { value: 'dark', label: 'Dark', icon: 'Moon' },
    { value: 'auto', label: 'Auto', icon: 'Monitor' }
  ];

  const emailFrequencies = [
    { value: 'immediate', label: 'Immediate' },
    { value: 'daily', label: 'Daily digest' },
    { value: 'weekly', label: 'Weekly digest' },
    { value: 'never', label: 'Never' }
  ];

  const notificationSettings = [
    {
      key: 'boardInvites',
      title: 'Board Invitations',
      description: 'When someone invites you to collaborate on a board',
      preview: 'Sarah invited you to "Project Planning Board"'
    },
    {
      key: 'newComments',
      title: 'New Comments',
      description: 'When someone comments on your boards or posts',
      preview: 'Mike commented on your post in "Team Updates"'
    },
    {
      key: 'boardUpdates',
      title: 'Board Updates',
      description: 'When content is added to boards you follow',
      preview: 'New content added to "Marketing Campaign"'
    },
    {
      key: 'weeklyDigest',
      title: 'Weekly Digest',
      description: 'Summary of your board activity and updates',
      preview: 'Your weekly activity summary is ready'
    },
    {
      key: 'emailNotifications',
      title: 'Email Notifications',
      description: 'Receive notifications via email',
      preview: `Get notified at ${user?.email || 'your@email.com'}`
    },
    {
      key: 'pushNotifications',
      title: 'Push Notifications',
      description: 'Receive browser push notifications',
      preview: 'Get instant notifications in your browser'
    }
  ];

  useEffect(() => {
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      
      // Get user preferences from database
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') {
        throw profileError;
      }

      // Get preferences from user metadata as fallback
      const userMetadata = user.user_metadata || {};
      const dbPreferences = profile?.preferences || {};
      
      // Merge preferences from both sources
      const loadedPreferences = {
        notifications: {
          boardInvites: dbPreferences.notifications?.boardInvites ?? userMetadata.notifications?.boardInvites ?? true,
          newComments: dbPreferences.notifications?.newComments ?? userMetadata.notifications?.newComments ?? true,
          boardUpdates: dbPreferences.notifications?.boardUpdates ?? userMetadata.notifications?.boardUpdates ?? false,
          weeklyDigest: dbPreferences.notifications?.weeklyDigest ?? userMetadata.notifications?.weeklyDigest ?? true,
          emailNotifications: dbPreferences.notifications?.emailNotifications ?? userMetadata.notifications?.emailNotifications ?? true,
          pushNotifications: dbPreferences.notifications?.pushNotifications ?? userMetadata.notifications?.pushNotifications ?? false
        },
        language: dbPreferences.language || userMetadata.language || 'en',
        theme: dbPreferences.theme || userMetadata.theme || 'auto',
        emailFrequency: dbPreferences.emailFrequency || userMetadata.emailFrequency || 'daily'
      };

      setPreferences(loadedPreferences);
      setOriginalPreferences(JSON.parse(JSON.stringify(loadedPreferences)));
    } catch (err) {
      console.error('Error loading preferences:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
  };

  const showError = (message) => {
    setErrorMessage(message);
    setShowErrorModal(true);
  };

  const handleNotificationToggle = (key) => {
    setPreferences(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key]
      }
    }));
    setHasChanges(true);
  };

  const handlePreferenceChange = (category, value) => {
    setPreferences(prev => ({
      ...prev,
      [category]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update preferences in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user?.email || '',
          preferences: preferences,
          updated_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // Update user metadata
      const { error: userError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          preferences: preferences,
          preferences_updated_at: new Date().toISOString()
        }
      });

      if (userError) throw userError;

      // Log preference change
      const { error: logError } = await supabase
        .from('user_activity')
        .insert([
          {
            user_id: user.id,
            activity_type: 'preferences_updated',
            activity_data: {
              changes: getChanges(originalPreferences, preferences)
            },
            timestamp: new Date().toISOString()
          }
        ]);

      if (logError) console.error('Error logging activity:', logError);

      setOriginalPreferences(JSON.parse(JSON.stringify(preferences)));
      setHasChanges(false);
      showSuccess('Preferences saved successfully!');
    } catch (error) {
      console.error('Preferences update failed:', error);
      showError('Failed to save preferences. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (originalPreferences) {
      setPreferences(JSON.parse(JSON.stringify(originalPreferences)));
      setHasChanges(false);
    }
  };

  const getChanges = (original, current) => {
    const changes = {};
    
    // Check notification changes
    if (original && current) {
      Object.keys(current.notifications).forEach(key => {
        if (original.notifications[key] !== current.notifications[key]) {
          changes[`notifications.${key}`] = {
            from: original.notifications[key],
            to: current.notifications[key]
          };
        }
      });

      // Check other preference changes
      ['language', 'theme', 'emailFrequency'].forEach(key => {
        if (original[key] !== current[key]) {
          changes[key] = {
            from: original[key],
            to: current[key]
          };
        }
      });
    }

    return changes;
  };

  const applyTheme = (theme) => {
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', prefersDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  };

  // Apply theme when it changes
  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        <span className="ml-2 text-text-secondary">Loading preferences...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <Icon name="AlertTriangle" size={48} className="text-error mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Error Loading Preferences
        </h3>
        <p className="text-text-secondary mb-4">{error}</p>
        <Button variant="outline" onClick={loadPreferences}>
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-1200 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl">
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon name="Check" size={24} className="text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Success!
                </h3>
                <p className="text-gray-600 mb-4">
                  {successMessage}
                </p>
                <Button
                  variant="primary"
                  onClick={() => setShowSuccessModal(false)}
                  className="w-full"
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="fixed inset-0 z-1200 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl">
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Icon name="X" size={24} className="text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Error
                </h3>
                <p className="text-gray-600 mb-4">
                  {errorMessage}
                </p>
                <Button
                  variant="outline"
                  onClick={() => setShowErrorModal(false)}
                  className="w-full"
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Notification Preferences
          </h3>
          <div className="text-sm text-text-secondary">
            Manage how you receive notifications
          </div>
        </div>
        <div className="space-y-6">
          {notificationSettings.map((setting) => (
            <div key={setting.key} className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="text-sm font-medium text-text-primary">
                    {setting.title}
                  </h4>
                </div>
                <p className="text-sm text-text-secondary mb-2">
                  {setting.description}
                </p>
                <div className="text-xs text-text-muted bg-surface-50 px-2 py-1 rounded">
                  Example: {setting.preview}
                </div>
              </div>
              <button
                onClick={() => handleNotificationToggle(setting.key)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ml-4
                  ${preferences.notifications[setting.key] ? 'bg-primary' : 'bg-border'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200
                    ${preferences.notifications[setting.key] ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Email Frequency */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Email Frequency
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Choose how often you want to receive email notifications
        </p>
        <div className="space-y-3">
          {emailFrequencies.map((frequency) => (
            <label key={frequency.value} className="flex items-center space-x-3 cursor-pointer">
              <input
                type="radio"
                name="emailFrequency"
                value={frequency.value}
                checked={preferences.emailFrequency === frequency.value}
                onChange={(e) => handlePreferenceChange('emailFrequency', e.target.value)}
                className="w-4 h-4 text-primary border-border focus:ring-primary"
              />
              <span className="text-sm text-text-primary">{frequency.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Language
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Choose your preferred language for the interface
        </p>
        <select
          value={preferences.language}
          onChange={(e) => handlePreferenceChange('language', e.target.value)}
          className="w-full max-w-xs px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {languages.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Theme */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Theme Preference
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Choose how the interface should look
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {themes.map((theme) => (
            <button
              key={theme.value}
              onClick={() => handlePreferenceChange('theme', theme.value)}
              className={`
                p-4 border-2 rounded-xl transition-all duration-200 hover:shadow-md
                ${preferences.theme === theme.value
                  ? 'border-primary bg-primary-50' : 'border-border hover:border-primary'
                }
              `}
            >
              <div className="flex flex-col items-center space-y-2">
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center
                  ${preferences.theme === theme.value
                    ? 'bg-primary text-white' : 'bg-surface-100 text-text-secondary'
                  }
                `}>
                  <Icon name={theme.icon} size={24} />
                </div>
                <span className={`
                  text-sm font-medium
                  ${preferences.theme === theme.value
                    ? 'text-primary' : 'text-text-primary'
                  }
                `}>
                  {theme.label}
                </span>
                {theme.value === 'auto' && (
                  <span className="text-xs text-text-muted">
                    Follows system
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Privacy & Data */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Privacy & Data
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-text-primary">Analytics</h4>
              <p className="text-sm text-text-secondary">
                Help us improve by sharing anonymous usage data
              </p>
            </div>
            <button
              onClick={() => handleNotificationToggle('analytics')}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200
                ${preferences.notifications.analytics ? 'bg-primary' : 'bg-border'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200
                  ${preferences.notifications.analytics ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Save Actions */}
      {hasChanges && (
        <div className="flex items-center justify-between p-4 bg-warning-50 border border-warning-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <Icon name="AlertCircle" size={20} className="text-warning-600" />
            <span className="text-sm text-warning-700">
              You have unsaved changes
            </span>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={isSaving}
              iconName={isSaving ? "Loader2" : "Save"}
            >
              {isSaving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default withAuth(PreferencesSettings);
