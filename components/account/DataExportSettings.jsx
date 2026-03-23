import React, { useState, useEffect } from 'react';
import { withAuth } from '@/lib/withAuth';
import { useSupabase } from '@/lib/supabase';
import Icon from '../../AppIcon';
import { Button } from '@/components/ui/button';

interface DataExportSettingsProps {
  user: any;
}

const DataExportSettings: React.FC<DataExportSettingsProps> = ({ user }) => {
  const { supabase } = useSupabase();
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportHistory, setExportHistory] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>(null);

  const exportOptions = [
    {
      id: 'boards',
      title: 'Board Data',
      description: 'Export all your boards and their content',
      format: 'JSON',
      size: '~2.5MB',
      icon: 'Grid3X3'
    },
    {
      id: 'profile',
      title: 'Profile Information',
      description: 'Your personal information and settings',
      format: 'JSON',
      size: '~50KB',
      icon: 'User'
    },
    {
      id: 'activity',
      title: 'Activity History',
      description: 'Your collaboration and activity logs',
      format: 'CSV',
      size: '~500KB',
      icon: 'Activity'
    },
    {
      id: 'media',
      title: 'Media Files',
      description: 'All uploaded images, videos, and documents',
      format: 'ZIP',
      size: '~15MB',
      icon: 'FileImage'
    }
  ];

  useEffect(() => {
    loadUserData();
  }, [user]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      
      // Get user profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      // Get export history
      const { data: exports, error: exportsError } = await supabase
        .from('data_exports')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (exportsError) throw exportsError;

      setUserData(profile);
      setExportHistory(exports || []);
    } catch (err: any) {
      console.error('Error loading user data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setShowSuccessModal(true);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setShowErrorModal(true);
  };

  const handleExport = async (exportType: string) => {
    setIsExporting(true);
    try {
      // Record export request in database
      const { data: exportRecord, error: exportError } = await supabase
        .from('data_exports')
        .insert([
          {
            user_id: user.id,
            export_type: exportType,
            status: 'pending',
            requested_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (exportError) throw exportError;

      // Simulate export processing
      setTimeout(async () => {
        try {
          // Update export status to completed
          await supabase
            .from('data_exports')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              download_url: `https://exports.example.com/${exportRecord.id}`
            })
            .eq('id', exportRecord.id);

          setIsExporting(false);
          showSuccess(`${exportType} export completed! Download will start shortly.`);
          loadUserData(); // Refresh export history
        } catch (updateError) {
          console.error('Error updating export status:', updateError);
          setIsExporting(false);
          showError('Export processing failed. Please try again.');
        }
      }, 2000);
    } catch (error) {
      setIsExporting(false);
      showError('Export failed. Please try again.');
      console.error('Export failed:', error);
    }
  };

  const handleExportAll = async () => {
    setIsExporting(true);
    try {
      // Record export request in database
      const { data: exportRecord, error: exportError } = await supabase
        .from('data_exports')
        .insert([
          {
            user_id: user.id,
            export_type: 'all',
            status: 'pending',
            requested_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (exportError) throw exportError;

      // Simulate export processing
      setTimeout(async () => {
        try {
          // Update export status to completed
          await supabase
            .from('data_exports')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              download_url: `https://exports.example.com/${exportRecord.id}`
            })
            .eq('id', exportRecord.id);

          setIsExporting(false);
          showSuccess('Complete data export completed! Download will start shortly.');
          loadUserData(); // Refresh export history
        } catch (updateError) {
          console.error('Error updating export status:', updateError);
          setIsExporting(false);
          showError('Export processing failed. Please try again.');
        }
      }, 3000);
    } catch (error) {
      setIsExporting(false);
      showError('Export failed. Please try again.');
      console.error('Export failed:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      showError('Please type the confirmation text exactly as shown.');
      return;
    }

    setIsDeleting(true);
    try {
      // Record deletion request
      const { error: deleteRequestError } = await supabase
        .from('account_deletions')
        .insert([
          {
            user_id: user.id,
            requested_at: new Date().toISOString(),
            status: 'pending'
          }
        ]);

      if (deleteRequestError) throw deleteRequestError;

      // Update user metadata to mark for deletion
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          deletion_requested: true,
          deletion_requested_at: new Date().toISOString()
        }
      });

      if (updateError) throw updateError;

      setTimeout(() => {
        setIsDeleting(false);
        showSuccess('Account deletion initiated. You will receive a confirmation email.');
        setShowDeleteModal(false);
      }, 2000);
    } catch (error) {
      setIsDeleting(false);
      showError('Account deletion failed. Please try again.');
      console.error('Account deletion failed:', error);
    }
  };

  const resetDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteStep(1);
    setDeleteConfirmation('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Icon name="Loader2" size={24} className="animate-spin text-primary" />
        <span className="ml-2 text-text-secondary">Loading data export settings...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <Icon name="AlertTriangle" size={48} className="text-error mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Error Loading Settings
        </h3>
        <p className="text-text-secondary mb-4">{error}</p>
        <Button variant="outline" onClick={loadUserData}>
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

      {/* Data Export */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              Export Your Data
            </h3>
            <p className="text-sm text-text-secondary">
              Download your data in portable formats
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportAll}
            loading={isExporting}
            iconName={isExporting ? "Loader2" : "Download"}
          >
            Export All
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {exportOptions.map((option) => (
            <div
              key={option.id}
              className="border border-border rounded-lg p-4 hover:border-primary transition-colors duration-200"
            >
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-surface-100 rounded-lg flex items-center justify-center">
                  <Icon name={option.icon} size={20} className="text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-text-primary mb-1">
                    {option.title}
                  </h4>
                  <p className="text-sm text-text-secondary mb-2">
                    {option.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs text-text-muted">
                      <span>{option.format}</span>
                      <span>•</span>
                      <span>{option.size}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExport(option.id)}
                      disabled={isExporting}
                      iconName="Download"
                    >
                      Export
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Export History */}
        {exportHistory.length > 0 && (
          <div className="mt-6">
            <h4 className="font-medium text-text-primary mb-3">Recent Exports</h4>
            <div className="space-y-2">
              {exportHistory.slice(0, 3).map((exportItem) => (
                <div key={exportItem.id} className="flex items-center justify-between p-3 bg-surface-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Icon name="Download" size={16} className="text-text-secondary" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {exportItem.export_type === 'all' ? 'Complete Export' : exportItem.export_type}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {new Date(exportItem.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    exportItem.status === 'completed' ? 'bg-green-100 text-green-600' :
                    exportItem.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                    {exportItem.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-surface-50 border border-border rounded-lg">
          <div className="flex items-start space-x-3">
            <Icon name="Info" size={20} className="text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-text-primary mb-1">
                About Data Export
              </h4>
              <ul className="text-sm text-text-secondary space-y-1">
                <li>• Exports are generated in real-time and may take a few minutes</li>
                <li>• All data is exported in standard, portable formats</li>
                <li>• Media files are compressed into ZIP archives</li>
                <li>• Export links are valid for 24 hours after generation</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Account Deletion */}
      <div className="bg-surface border border-error-200 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <div className="w-10 h-10 bg-error-100 rounded-lg flex items-center justify-center">
            <Icon name="AlertTriangle" size={20} className="text-error" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Delete Account
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            
            <div className="bg-error-50 border border-error-200 rounded-lg p-4 mb-4">
              <h4 className="font-medium text-error-700 mb-2">
                What will be deleted:
              </h4>
              <ul className="text-sm text-error-600 space-y-1">
                <li>• All your boards and their content</li>
                <li>• Your profile information and settings</li>
                <li>• All uploaded media files</li>
                <li>• Your collaboration history</li>
                <li>• Any active subscriptions will be cancelled</li>
              </ul>
            </div>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
              iconName="Trash2"
              disabled={user.user_metadata?.deletion_requested}
            >
              {user.user_metadata?.deletion_requested ? 'Deletion Pending' : 'Delete My Account'}
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-1200 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative w-full max-w-md bg-surface rounded-2xl shadow-elevation-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-primary">
                    Delete Account
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconName="X"
                    onClick={resetDeleteModal}
                  />
                </div>

                {deleteStep === 1 && (
                  <div className="space-y-4">
                    <div className="text-center p-4 bg-error-50 border border-error-200 rounded-lg">
                      <Icon name="AlertTriangle" size={32} className="text-error mx-auto mb-2" />
                      <h4 className="font-medium text-error-700 mb-1">
                        This action is irreversible
                      </h4>
                      <p className="text-sm text-error-600">
                        All your data will be permanently deleted and cannot be recovered.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm text-text-primary">
                        Before deleting your account, consider:
                      </p>
                      <ul className="text-sm text-text-secondary space-y-1 pl-4">
                        <li>• Exporting your data for backup</li>
                        <li>• Transferring board ownership to collaborators</li>
                        <li>• Cancelling any active subscriptions</li>
                      </ul>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={resetDeleteModal}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        fullWidth
                        onClick={() => setDeleteStep(2)}
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                )}

                {deleteStep === 2 && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <h4 className="font-medium text-text-primary mb-2">
                        Confirm Account Deletion
                      </h4>
                      <p className="text-sm text-text-secondary">
                        Type <strong>DELETE MY ACCOUNT</strong> to confirm:
                      </p>
                    </div>

                    <input
                      type="text"
                      placeholder="DELETE MY ACCOUNT"
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-error focus:border-transparent"
                    />

                    <div className="flex items-center space-x-3">
                      <Button
                        variant="ghost"
                        fullWidth
                        onClick={() => setDeleteStep(1)}
                      >
                        Back
                      </Button>
                      <Button
                        variant="danger"
                        fullWidth
                        onClick={handleDeleteAccount}
                        loading={isDeleting}
                        disabled={deleteConfirmation !== 'DELETE MY ACCOUNT'}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete Account'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default withAuth(DataExportSettings);