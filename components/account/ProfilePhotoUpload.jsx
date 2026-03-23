import React, { useState, useRef, useEffect } from 'react';
import { withAuth } from '@/lib/withAuth';
import { useSupabase } from '@/lib/supabase';
import Icon from '../../../components/AppIcon';
import Image from '../../../components/AppImage';
import { Button } from '@/components/ui/button';

const ProfilePhotoUpload = ({ user }) => {
  const { supabase } = useSupabase();
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Load current photo from user metadata
  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setPreviewUrl(user.user_metadata.avatar_url);
    }
  }, [user]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file) => {
    if (file && file.type.startsWith('image/')) {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      
      setError(null);
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target.result);
        setShowCropModal(true);
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file');
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const uploadToSupabase = async (file) => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/avatar.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  };

  const handleCropSave = async () => {
    if (!selectedFile || !previewUrl) return;

    setIsUploading(true);
    setError(null);

    try {
      // Upload file to Supabase Storage
      const avatarUrl = await uploadToSupabase(selectedFile);
      
      // Update user metadata with new avatar URL
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          avatar_url: avatarUrl
        }
      });

      if (updateError) throw updateError;

      // Update preview URL to the uploaded file URL
      setPreviewUrl(avatarUrl);
      setShowCropModal(false);
      setSelectedFile(null);
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error saving photo:', error);
      setError('Failed to save photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Remove avatar URL from user metadata
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          avatar_url: null
        }
      });

      if (updateError) throw updateError;

      // Optionally delete the file from storage
      if (user?.user_metadata?.avatar_url) {
        const fileName = `${user.id}/avatar.${user.user_metadata.avatar_url.split('.').pop()}`;
        await supabase.storage
          .from('avatars')
          .remove([fileName]);
      }

      setPreviewUrl(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error removing photo:', error);
      setError('Failed to remove photo. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-error-50 border border-error-200 rounded-lg p-3">
          <p className="text-sm text-error-600">{error}</p>
        </div>
      )}

      <div className="flex items-center space-x-6">
        {/* Current Photo */}
        <div className="relative">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-surface-100 border-2 border-border">
            {previewUrl ? (
              <Image
                src={previewUrl}
                alt="Profile photo"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="User" size={32} className="text-text-secondary" />
              </div>
            )}
          </div>
          {previewUrl && (
            <button
              onClick={handleRemovePhoto}
              disabled={isLoading}
              className="absolute -top-2 -right-2 w-6 h-6 bg-error rounded-full flex items-center justify-center hover:bg-error-600 transition-colors duration-200 disabled:opacity-50"
            >
              <Icon name="X" size={14} color="white" />
            </button>
          )}
        </div>

        {/* Upload Area */}
        <div className="flex-1">
          <div
            className={`
              border-2 border-dashed rounded-lg p-6 text-center transition-all duration-200 cursor-pointer
              ${isDragging 
                ? 'border-primary bg-primary-50' :'border-border hover:border-primary hover:bg-surface-50'
              }
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
            <Icon name="Upload" size={24} className="mx-auto text-text-secondary mb-2" />
            <p className="text-sm text-text-primary font-medium">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-text-secondary mt-1">
              PNG, JPG, GIF up to 5MB
            </p>
          </div>
        </div>
      </div>

      {/* Crop Modal */}
      {showCropModal && (
        <div className="fixed inset-0 z-1200 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-surface rounded-2xl shadow-elevation-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">
                  Crop Profile Photo
                </h3>
                <div className="space-y-4">
                  <div className="w-full h-64 bg-surface-100 rounded-lg overflow-hidden flex items-center justify-center">
                    {previewUrl && (
                      <Image
                        src={previewUrl}
                        alt="Preview"
                        className="max-w-full max-h-full object-contain"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-end space-x-3">
                    <Button
                      variant="ghost"
                      onClick={() => setShowCropModal(false)}
                      disabled={isUploading}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleCropSave}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        'Save Photo'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default withAuth(ProfilePhotoUpload);