'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import Icon from '@/components/AppIcon';
import { useSupabase } from '@/lib/supabase';

interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
}

export default function UserProfileDropdown() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Settings form states
  const [displayName, setDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [profileVisibility, setProfileVisibility] = useState('public');
  const [activityTracking, setActivityTracking] = useState(true);

  useEffect(() => {
    getProfile();
  }, []);

  const getProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data: profile, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
        } else if (profile) {
          setUser(profile);
          setEditForm({
            full_name: profile.full_name || '',
            email: profile.email || '',
          });
          setDisplayName(profile.full_name || '');
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
    }
  };

  const uploadAvatar = async () => {
    if (!avatarFile || !user) return null;

    setUploadingAvatar(true);
    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      return null;
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      let avatarUrl = user.avatar_url;
      
      // Upload new avatar if selected
      if (avatarFile) {
        const newAvatarUrl = await uploadAvatar();
        if (newAvatarUrl) {
          avatarUrl = newAvatarUrl;
        }
      }

      const { error } = await supabase
        .from('users')
        .update({
          full_name: editForm.full_name,
          email: editForm.email,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      // Update local state
      setUser({
        ...user,
        full_name: editForm.full_name,
        email: editForm.email,
        avatar_url: avatarUrl,
      });

      // Reset form
      setAvatarFile(null);
      setAvatarPreview(null);
      setIsEditModalOpen(false);
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('users')
        .update({
          full_name: displayName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, full_name: displayName });
      alert('Account settings updated successfully!');
    } catch (error) {
      console.error('Error updating account:', error);
      alert('Failed to update account settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      alert('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      alert('Password must be at least 8 characters long.');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      alert('Password updated successfully!');
    } catch (error) {
      console.error('Error updating password:', error);
      alert('Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading || !user) {
    return (
      <Avatar className="h-8 w-8">
        <AvatarFallback>
          <Icon name="User" size={16} />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar_url} alt={user.full_name} />
              <AvatarFallback className="bg-orange-500 text-white">
                {getInitials(user.full_name || user.email)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-80 mt-3" align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-3 p-2">
              <div className="flex items-center space-x-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.avatar_url} alt={user.full_name} />
                  <AvatarFallback className="bg-orange-500 text-white text-lg">
                    {getInitials(user.full_name || user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col space-y-1">
                  <p className="font-medium leading-none">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => setIsEditModalOpen(true)}
              >
                <Icon name="User" className="mr-2 h-4 w-4" />
                Edit Profile
              </Button>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsSettingsOpen(true)}>
            <Icon name="Settings" className="mr-2 h-4 w-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="User" className="mr-2 h-4 w-4" />
            My profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="Info" className="mr-2 h-4 w-4" />
            What's new
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="Info" className="mr-2 h-4 w-4" />
            Help and feedback
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Icon name="Shield" className="mr-2 h-4 w-4" />
            Privacy policy
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600">
            <Icon name="X" className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Profile Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Make changes to your profile here. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-20 w-20">
                <AvatarImage 
                  src={avatarPreview || user.avatar_url} 
                  alt={user.full_name} 
                />
                <AvatarFallback className="bg-orange-500 text-white text-xl">
                  {getInitials(user.full_name || user.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center space-y-2">
                <Label htmlFor="avatar" className="cursor-pointer">
                  <div className="flex items-center space-x-2 text-sm text-blue-600 hover:text-blue-800">
                    <Icon name="Camera" size={16} />
                    <span>Change Avatar</span>
                  </div>
                </Label>
                <Input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    full_name: e.target.value
                  })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({
                    ...editForm,
                    email: e.target.value
                  })}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => setIsEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveProfile}
              disabled={loading || uploadingAvatar}
            >
              {uploadingAvatar ? 'Uploading...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
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

          <Tabs defaultValue="account" className="w-full">
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
                  <Label htmlFor="email-readonly">Email Address</Label>
                  <Input
                    id="email-readonly"
                    value={user.email}
                    disabled
                    className="bg-gray-50"
                  />
                  <p className="text-xs text-gray-500">
                    Email cannot be changed. Contact support if needed.
                  </p>
                </div>

                <Separator />

                <Button
                  onClick={handleSaveAccount}
                  disabled={loading}
                  className="min-w-[100px]"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
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
                      onClick={() => {
                        if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
                          alert('Account deletion would be implemented here.');
                        }
                      }}
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

                <Button 
                  onClick={() => alert('Notification preferences saved!')} 
                  className="min-w-[100px]"
                >
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

                <Button 
                  onClick={() => alert('Privacy settings saved!')} 
                  className="min-w-[100px]"
                >
                  Save Privacy Settings
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => setIsSettingsOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}