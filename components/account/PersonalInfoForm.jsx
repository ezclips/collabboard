import React, { useState, useEffect } from 'react';
import { withAuth } from '@/lib/withAuth';
import { useSupabase } from '@/lib/supabase';
import Icon from '../../../components/AppIcon';
import { Button } from '@/components/ui/button';
import Input from '../../../components/ui/Input';
import ProfilePhotoUpload from './ProfilePhotoUpload';

const PersonalInfoForm = ({ user }) => {
  const { supabase } = useSupabase();
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    bio: '',
    timezone: 'UTC',
    profilePhoto: null
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState(null);

  const timezones = [
    { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
    { value: 'America/New_York', label: 'Eastern Time (ET)' },
    { value: 'America/Chicago', label: 'Central Time (CT)' },
    { value: 'America/Denver', label: 'Mountain Time (MT)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
    { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
    { value: 'Europe/Paris', label: 'Central European Time (CET)' },
    { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
    { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
    { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' }
  ];

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        setIsLoading(true);
        
        // Get user profile from user_profiles table
        const { data: profile, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          throw profileError;
        }

        // Set form data from user metadata and profile
        setFormData({
          displayName: profile?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name || '',
          email: user.email || '',
          bio: profile?.bio || user.user_metadata?.bio || '',
          timezone: profile?.timezone || user.user_metadata?.timezone || 'UTC',
          profilePhoto: user.user_metadata?.avatar_url || null
        });
      } catch (error) {
        console.error('Error loading user data:', error);
        setError('Failed to load user data. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadUserData();
    }
  }, [user, supabase]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const handlePhotoChange = (photoUrl) => {
    setFormData(prev => ({
      ...prev,
      profilePhoto: photoUrl
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      // Update user auth metadata
      const { error: authError } = await supabase.auth.updateUser({
        email: formData.email,
        data: {
          display_name: formData.displayName,
          full_name: formData.displayName,
          bio: formData.bio,
          timezone: formData.timezone
        }
      });

      if (authError) throw authError;

      // Update or insert user profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .upsert({
          id: user.id,
          display_name: formData.displayName,
          bio: formData.bio,
          timezone: formData.timezone,
          updated_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      setHasChanges(false);
      
      // Show success message (you might want to use a toast notification here)
      console.log('Profile updated successfully');
      
    } catch (error) {
      console.error('Save failed:', error);
      setError('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormData({
      displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || '',
      email: user.email || '',
      bio: user.user_metadata?.bio || '',
      timezone: user.user_metadata?.timezone || 'UTC',
      profilePhoto: user.user_metadata?.avatar_url || null
    });
    setHasChanges(false);
    setError(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-error-50 border border-error-200 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <Icon name="AlertCircle" size={20} className="text-error-600" />
            <p className="text-sm text-error-600">{error}</p>
          </div>
        </div>
      )}

      {/* Profile Photo */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Profile Photo
        </h3>
        <ProfilePhotoUpload />
      </div>

      {/* Basic Information */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-text-primary">
          Basic Information
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Display Name *
            </label>
            <Input
              type="text"
              placeholder="Enter your display name"
              value={formData.displayName}
              onChange={(e) => handleInputChange('displayName', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Email Address *
            </label>
            <Input
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Changing your email will require verification
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Bio
          </label>
          <textarea
            placeholder="Tell others about yourself..."
            value={formData.bio}
            onChange={(e) => handleInputChange('bio', e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
          <p className="text-xs text-text-secondary mt-1">
            {formData.bio.length}/500 characters
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Timezone
          </label>
          <select
            value={formData.timezone}
            onChange={(e) => handleInputChange('timezone', e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            {timezones.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
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
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default withAuth(PersonalInfoForm);