'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import Icon from '@/components/AppIcon';
import { useSupabase } from '@/lib/supabase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUserUpdate: (updatedUser: any) => void;
}

export default function SettingsModal({ isOpen, onClose, user, onUserUpdate }: SettingsModalProps) {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('account');
  
  // Account settings
  const [displayName, setDisplayName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  
  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  
  // Privacy settings
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [activityTracking, setActivityTracking] = useState(true);

  const handleSaveAccount = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: displayName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      onUserUpdate({ ...user, full_name: displayName });
      showSuccess('Account settings updated successfully!');
    } catch (error) {
      console.error('Error updating account:', error);
      showError('Failed to update account settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      showError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showSuccess('Password updated successfully!');
    } catch (error) {
      console.error('Error updating password:', error);
      showError('Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    // In a real app, you'd save these to your database
    console.log('Saving notifications:', {
      emailNotifications,
      pushNotifications,
      weeklyDigest
    });
    showSuccess('Notification settings updated!');
  };

  const handleSavePrivacy = async () => {
    // In a real app, you'd save these to your database
    console.log('Saving privacy settings:', {
      profileVisibility,
      activityTracking
    });
    showSuccess('Privacy settings updated!');
  };

  const showSuccess = (message: string) => {
    // You can implement a toast notification here
    alert(message);
  };

  const showError = (message: string) => {
    // You can implement a toast notification here
    alert(message);
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      'Are you sure you want to delete your account? This action cannot be undone.'
    );
    
    if (!confirmed) return;

    setLoading(true);
    try {
      // In a real app, you'd have a proper account deletion flow
      const { error } = await supabase
        .from('users')
        .update({ 
          deleted_at: new Date().toISOString(),
          status: 'deleted' 
        })
        .eq('id', user.id);

      if (error) throw error;

      await supabase.auth.signOut();
      showSuccess('Account deleted successfully.');
    } catch (error) {
      console.error('Error deleting account:', error);
      showError('Failed to delete account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="Settings" size={20} />
            Settings
          </DialogTitle>
          <DialogDescription>
            Manage your account settings and preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display Name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  value={email}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500">
                  Email cannot be changed. Contact support if needed.
                </p>
              </div>

              <Separator />

              <div className="flex justify-between items-center">
                <Button
                  onClick={handleSaveAccount}
                  disabled={loading}
                  className="min-w-[100px]"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-4">
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Change Password</h3>
              
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>

              <Button
                onClick={handleChangePassword}
                disabled={loading || !newPassword || !confirmPassword}
                className="min-w-[100px]"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-lg font-medium text-red-600">Danger Zone</h3>
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <h4 className="font-medium text-red-800 mb-2">Delete Account</h4>
                  <p className="text-sm text-red-600 mb-3">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={loading}
                  >
                    Delete Account
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Email Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Receive notifications about your account via email
                  </p>
                </div>
                <Switch
                  checked={emailNotifications}
                  onCheckedChange={setEmailNotifications}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Push Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Receive push notifications in your browser
                  </p>
                </div>
                <Switch
                  checked={pushNotifications}
                  onCheckedChange={setPushNotifications}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Weekly Digest</Label>
                  <p className="text-sm text-gray-500">
                    Get a weekly summary of your activity
                  </p>
                </div>
                <Switch
                  checked={weeklyDigest}
                  onCheckedChange={setWeeklyDigest}
                />
              </div>

              <Button onClick={handleSaveNotifications} className="min-w-[100px]">
                Save Preferences
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4">
            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Profile Visibility</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="public"
                      name="visibility"
                      value="public"
                      checked={profileVisibility === 'public'}
                      onChange={(e) => setProfileVisibility(e.target.value)}
                    />
                    <Label htmlFor="public">Public - Anyone can see your profile</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="private"
                      name="visibility"
                      value="private"
                      checked={profileVisibility === 'private'}
                      onChange={(e) => setProfileVisibility(e.target.value)}
                    />
                    <Label htmlFor="private">Private - Only you can see your profile</Label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Activity Tracking</Label>
                  <p className="text-sm text-gray-500">
                    Allow us to track your activity to improve the experience
                  </p>
                </div>
                <Switch
                  checked={activityTracking}
                  onCheckedChange={setActivityTracking}
                />
              </div>

              <Button onClick={handleSavePrivacy} className="min-w-[100px]">
                Save Privacy Settings
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}