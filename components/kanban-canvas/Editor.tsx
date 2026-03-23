'use client';

import { memo, useState, useEffect, useMemo, type CSSProperties } from 'react';
import type { Card, CardAttachment, Comment, Link, Vote } from '@/types/kanban-canvas';
import { X, Trash2, ChevronDown, Plus, ThumbsUp, ThumbsDown, Calendar } from 'lucide-react';
import { useKanbanData, useKanbanPersistence, useKanbanUI } from './store';
import { supabase } from '@/lib/supabase';
import { ConfirmModal } from './ConfirmModal';
import { useKanbanI18n } from './useKanbanI18n';

interface EditorProps {
  card: Card | null;
  onClose: () => void;
  readonly?: boolean;
}

const STATUS_OTHER_VALUE = '__other__';

export const Editor = memo(function Editor({ card, onClose, readonly = false }: EditorProps) {
  const actions = useKanbanPersistence();
  const data = useKanbanData();
  const ui = useKanbanUI();
  const { t } = useKanbanI18n();
  const [formData, setFormData] = useState<Partial<Card>>({});
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const [showUsersDropdown, setShowUsersDropdown] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [linkRelation, setLinkRelation] = useState('');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkError, setLinkError] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [voteBusy, setVoteBusy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customStatusDraft, setCustomStatusDraft] = useState('');
  const [isCustomStatusMode, setIsCustomStatusMode] = useState(false);
  const [showDateFormatMenu, setShowDateFormatMenu] = useState(false);

  const relationOptions = useMemo(
    () => [
      'Relates to',
      'Is required for',
      'Depends on',
      'Duplicates',
      'Is duplicated by',
      'Is parent for',
      'Is subtask of',
    ],
    []
  );

  const colorOptions = useMemo(
    () => ['#33B0B4', '#1E88E5', '#F2B134', '#43A047', '#E53935', '#9E9E9E'],
    []
  );
  const statusOptions = useMemo(() => {
    const defaults = ['To do', 'Unassigned', 'In development', 'Testing', 'Merged', 'Released'];
    const fromCards = data.cards
      .map((item) => item.status?.trim())
      .filter((value): value is string => Boolean(value));
    const current = formData.status?.trim();
    return Array.from(new Set([...defaults, ...fromCards, ...(current ? [current] : [])]));
  }, [data.cards, formData.status]);

  useEffect(() => {
    // Card object identity can change after store updates (e.g. comments/links).
    // Only reset local form state when switching to a different card id.
    if (card && card.id !== formData.id) {
      setFormData(card);
      setCustomStatusDraft('');
      setIsCustomStatusMode(false);
      setNewComment('');
      setLinkTargetId('');
      setLinkRelation('');
      setLinkError('');
    }
  }, [card?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadCurrentUser() {
      const { data: authData } = await supabase.auth.getUser();
      if (!cancelled) {
        setCurrentUserId(authData?.user?.id || '');
      }
    }
    loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!card) return null;

  const handleChange = (field: keyof Card, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const commitCustomStatus = () => {
    const nextStatus = customStatusDraft.trim();
    if (!nextStatus) return;
    handleChange('status', nextStatus);
    setCustomStatusDraft('');
    setIsCustomStatusMode(false);
  };

  const handleSave = async () => {
    if (readonly) return;
    if (card) {
      await actions.updateCard(card.id, formData);
      onClose();
    }
  };

  const handleDelete = () => {
    if (readonly) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (card) {
      await actions.deleteCard(card.id);
      onClose();
    }
  };

  const uploadAttachmentToStorage = async (file: File, cardId: string) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `kanban/${cardId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage
      .from('padlet-files')
      .upload(filePath, file, { upsert: false });

    if (error) {
      console.error('Failed to upload kanban attachment:', error.message);
      return '';
    }

    const { data } = supabase.storage.from('padlet-files').getPublicUrl(filePath);
    return data?.publicUrl || '';
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (readonly) return;
    if (!files) return;
    const fileArray = Array.from(files);
    const currentAttached = formData.attached || [];
    const hasExistingCover = currentAttached.some((file) => {
      if (typeof file === 'string') return false;
      return Boolean(file.isCover && (file.url || file.previewURL || file.coverURL));
    });

    let shouldSetCover = !hasExistingCover;
    const uploadedFiles: Array<string | CardAttachment> = [];
    for (const f of fileArray) {
      const isImage = f.type.startsWith('image/');
      const uploadedUrl = await uploadAttachmentToStorage(f, card.id);
      if (!uploadedUrl) {
        if (isImage) {
          const fallbackPreview = URL.createObjectURL(f);
          uploadedFiles.push({
            id: crypto.randomUUID(),
            name: f.name,
            type: f.type,
            url: fallbackPreview,
            previewURL: fallbackPreview,
            coverURL: fallbackPreview,
            isCover: shouldSetCover,
          });
          if (shouldSetCover) shouldSetCover = false;
        } else {
          uploadedFiles.push(f.name);
        }
        continue;
      }

      if (!isImage) {
        uploadedFiles.push({
          id: crypto.randomUUID(),
          name: f.name,
          type: f.type,
          url: uploadedUrl,
          previewURL: uploadedUrl,
          coverURL: uploadedUrl,
          isCover: false,
        });
        continue;
      }

      const fileData: CardAttachment = {
        id: crypto.randomUUID(),
        name: f.name,
        type: f.type,
        url: uploadedUrl,
        previewURL: uploadedUrl,
        coverURL: uploadedUrl,
        isCover: shouldSetCover,
      };
      if (shouldSetCover) shouldSetCover = false;
      uploadedFiles.push(fileData);
    }

    handleChange('attached', [...currentAttached, ...uploadedFiles]);
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    await handleFileUpload(e.dataTransfer.files);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const removeFile = (indexToRemove: number) => {
    if (readonly) return;
    const currentAttached = formData.attached || [];
    handleChange(
      'attached',
      currentAttached.filter((_, index) => index !== indexToRemove)
    );
  };

  const getAttachmentName = (file: string | CardAttachment) =>
    typeof file === 'string' ? file : file.name || 'File';

  const getAttachmentPreview = (file: string | CardAttachment) => {
    if (typeof file === 'string') return file.startsWith('http') ? file : '';
    return file.url || file.previewURL || file.coverURL || '';
  };

  const isImageAttachment = (file: string | CardAttachment) => {
    if (typeof file === 'string') {
      return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(file);
    }
    if (file.type) return file.type.startsWith('image/');
    const src = getAttachmentPreview(file);
    return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(src);
  };

  const getDisplayDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    if (ui.dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
    if (ui.dateFormat === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleAddComment = async () => {
    if (readonly) return;
    const text = newComment.trim();
    if (!text || !card || commentBusy) return;

    setCommentBusy(true);
    setCommentError('');

    const comment: Comment = {
      id: crypto.randomUUID(),
      cardId: card.id,
      text,
      date: new Date().toISOString(),
      userId: currentUserId || data.users[0]?.id || 'user-unknown',
    };

    const result = await actions.addComment(comment) as any;
    if (!result?.ok) {
      setCommentError(result?.message || t('failedSaveComment'));
      setCommentBusy(false);
      return;
    }
    const currentComments = formData.comments || [];
    handleChange('comments', [
      ...currentComments,
      {
        ...comment,
        id: result?.comment?.id || comment.id,
        userId: result?.comment?.user_id || comment.userId,
        date: result?.comment?.created_at || comment.date,
      },
    ]);
    setNewComment('');
    setCommentBusy(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (readonly) return;
    if (!card || commentBusy) return;
    setCommentBusy(true);
    setCommentError('');
    const result = await actions.deleteComment(card.id, commentId);
    if (!result?.ok) {
      setCommentError(result?.message || t('failedDeleteComment'));
      setCommentBusy(false);
      return;
    }
    const currentComments = formData.comments || [];
    handleChange('comments', currentComments.filter((comment) => comment.id !== commentId));
    setCommentBusy(false);
  };

  const handleVote = async (value: 1 | -1) => {
    if (readonly) return;
    if (!card || voteBusy || !currentUserId) return;
    setVoteBusy(true);
    const currentVotes = formData.votes || card.votes || [];
    const existingVote = currentVotes.find((vote) => vote.userId === currentUserId);

    if (existingVote && existingVote.value === value) {
      const deleteResult = await actions.removeVote(card.id, existingVote.id);
      if (deleteResult?.ok) {
        handleChange('votes', currentVotes.filter((vote) => vote.id !== existingVote.id));
      }
      setVoteBusy(false);
      return;
    }

    const vote: Vote = {
      id: crypto.randomUUID(),
      cardId: card.id,
      userId: currentUserId,
      value,
    };
    const result = await actions.addVote(vote) as any;
    if (result?.ok) {
      const nextVotes = currentVotes.filter((v) => v.userId !== currentUserId);
      nextVotes.push({
        id: result?.vote?.id || vote.id,
        cardId: card.id,
        userId: currentUserId,
        value: result?.vote?.value ?? value,
      });
      handleChange('votes', nextVotes);
    }
    setVoteBusy(false);
  };

  const handleAddLink = async () => {
    if (readonly) return;
    if (!card || !linkTargetId || !linkRelation) return;

    // Check for duplicates (same from+to+relation)
    const currentLinks = formData.links || [];
    const isDuplicate = currentLinks.some(
      link => link.slaveId === linkTargetId && link.relation === linkRelation
    );

    if (isDuplicate) {
      setLinkError(t('duplicateLinkExists'));
      return;
    }

    const newLink: Link = {
      id: crypto.randomUUID(),
      masterId: card.id,
      slaveId: linkTargetId,
      relation: linkRelation,
    };

    // Persist to database first so DB-level uniqueness wins in race conditions.
    const result = await actions.addLink(newLink);
    if (!result?.ok) {
      setLinkError(result?.message || t('failedAddLink'));
      return;
    }

    // Update local editor state after successful persistence.
    handleChange('links', [...currentLinks, newLink]);
    setLinkError('');
    setLinkTargetId('');
    setLinkRelation('');
  };

  const removeLink = (id: string) => {
    if (readonly) return;
    const currentLinks = formData.links || [];
    handleChange(
      'links',
      currentLinks.filter((link) => link.id !== id)
    );

    // Persist deletion to database
    actions.deleteLink(id);
  };

  const availableCards = data.cards.filter((c) => c.id !== card.id);
  const comments = formData.comments || card.comments || [];
  const votes = formData.votes || card.votes || [];
  const voteCount = votes.reduce((sum, vote) => sum + vote.value, 0);
  const myVote = votes.find((vote) => vote.userId === currentUserId);
  const links = formData.links || card.links || [];

  return (
    <>
      <div className="kanban-editor-overlay" onClick={onClose} />
      <div className="kanban-editor">
        <div className="kanban-editor-header">
          <h2>{readonly ? t('viewCard') : t('editCard')}</h2>
          <button
            onClick={onClose}
            className="kanban-editor-close-btn"
            aria-label={t('close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="kanban-editor-content">
          <div className="kanban-editor-field">
            <label>{t('label')}</label>
            <input
              type="text"
              value={formData.label || ''}
              onChange={(e) => handleChange('label', e.target.value)}
              className="kanban-editor-input"
              disabled={readonly}
            />
          </div>

          <div className="kanban-editor-field">
            <label>{t('description')}</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => handleChange('description', e.target.value)}
              className="kanban-editor-textarea"
              rows={4}
              disabled={readonly}
            />
          </div>

          <div className="kanban-editor-field">
            <label>{t('priority')}</label>
            <div className="kanban-priority-dropdown">
              <button
                type="button"
                className="kanban-editor-select kanban-priority-trigger"
                onClick={() => setShowPriorityDropdown(!showPriorityDropdown)}
                disabled={readonly}
              >
                {formData.priority ? (
                  <div className="kanban-priority-option">
                    <span className={`kanban-priority-dot ${formData.priority}`}></span>
                    <span className="kanban-priority-text">
                      {formData.priority.charAt(0).toUpperCase() + formData.priority.slice(1)}
                    </span>
                  </div>
                ) : (
                  t('none')
                )}
                <ChevronDown size={16} />
              </button>
              {!readonly && showPriorityDropdown && (
                <>
                  <div
                    className="kanban-dropdown-overlay"
                    onClick={() => setShowPriorityDropdown(false)}
                  />
                  <div className="kanban-priority-menu">
                    <button
                      type="button"
                      className="kanban-priority-item"
                      onClick={() => {
                        handleChange('priority', 'high');
                        setShowPriorityDropdown(false);
                      }}
                    >
                      <span className="kanban-priority-dot high"></span>
                      <span>{t('high')}</span>
                    </button>
                    <button
                      type="button"
                      className="kanban-priority-item"
                      onClick={() => {
                        handleChange('priority', 'medium');
                        setShowPriorityDropdown(false);
                      }}
                    >
                      <span className="kanban-priority-dot medium"></span>
                      <span>{t('medium')}</span>
                    </button>
                    <button
                      type="button"
                      className="kanban-priority-item"
                      onClick={() => {
                        handleChange('priority', 'low');
                        setShowPriorityDropdown(false);
                      }}
                    >
                      <span className="kanban-priority-dot low"></span>
                      <span>{t('low')}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="kanban-editor-field">
            <label>{t('status')}</label>
            <div className="kanban-select-wrap">
              <select
                className="kanban-editor-select"
                value={isCustomStatusMode ? STATUS_OTHER_VALUE : (formData.status || '')}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (nextValue === STATUS_OTHER_VALUE) {
                    setCustomStatusDraft('');
                    setIsCustomStatusMode(true);
                    return;
                  }
                  setIsCustomStatusMode(false);
                  setCustomStatusDraft('');
                  handleChange('status', nextValue || undefined);
                }}
                disabled={readonly}
              >
                <option value="">{t('none')}</option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                <option value={STATUS_OTHER_VALUE}>{t('other')}</option>
              </select>
              <ChevronDown size={16} className="kanban-select-arrow" />
            </div>
            {!readonly && isCustomStatusMode && (
              <input
                type="text"
                value={customStatusDraft}
                onChange={(e) => setCustomStatusDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitCustomStatus();
                  }
                }}
                onBlur={() => {
                  if (customStatusDraft.trim()) {
                    commitCustomStatus();
                    return;
                  }
                  setIsCustomStatusMode(false);
                }}
                className="kanban-editor-input"
                placeholder={t('addNewStatusHere')}
              />
            )}
          </div>

          <div className="kanban-editor-field">
            <label>{t('progress')} {formData.progress || 0}%</label>
            <input
              type="range"
              min="0"
              max="100"
              value={formData.progress || 0}
              onChange={(e) => handleChange('progress', parseInt(e.target.value, 10))}
              className="kanban-editor-range"
              style={{ '--range-progress': `${formData.progress || 0}%` } as CSSProperties}
              disabled={readonly}
            />
          </div>

          <div className="kanban-editor-field">
            <label>{t('project')}</label>
            <input
              type="text"
              value={formData.projectId || ''}
              onChange={(e) => handleChange('projectId', e.target.value || undefined)}
              className="kanban-editor-input"
              placeholder={t('projectPlaceholder')}
              disabled={readonly}
            />
          </div>

          <div className="kanban-editor-field">
            <div className="kanban-field-label-row">
              <label>{t('startDate')}</label>
              <div className="kanban-date-format-menu-wrap">
                <button
                  type="button"
                  className="kanban-date-format-trigger"
                  onClick={() => setShowDateFormatMenu((prev) => !prev)}
                  aria-label={t('dateFormat')}
                  disabled={readonly}
                >
                  <Calendar size={16} />
                </button>
                {!readonly && showDateFormatMenu && (
                  <>
                    <div
                      className="kanban-dropdown-overlay"
                      onClick={() => setShowDateFormatMenu(false)}
                    />
                    <div className="kanban-date-format-menu">
                      {(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] as const).map((format) => (
                        <button
                          key={format}
                          type="button"
                          className={`kanban-date-format-item ${ui.dateFormat === format ? 'selected' : ''}`}
                          onClick={() => {
                            actions.setDateFormat(format);
                            setShowDateFormatMenu(false);
                          }}
                        >
                          {format}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="kanban-date-wrap">
              <input
                type="date"
                value={formData.start_date || ''}
                onChange={(e) => handleChange('start_date', e.target.value)}
                className="kanban-editor-input"
                disabled={readonly}
              />
            </div>
            {formData.start_date && (
              <div className="kanban-editor-comment-meta">{getDisplayDate(formData.start_date)}</div>
            )}
          </div>

          <div className="kanban-editor-field">
            <label>{t('endDate')}</label>
            <div className="kanban-date-wrap">
              <input
                type="date"
                value={formData.end_date || ''}
                onChange={(e) => handleChange('end_date', e.target.value)}
                className="kanban-editor-input"
                disabled={readonly}
              />
            </div>
            {formData.end_date && (
              <div className="kanban-editor-comment-meta">{getDisplayDate(formData.end_date)}</div>
            )}
          </div>

          <div className="kanban-editor-field">
            <label>{t('users')}</label>
            <div className="kanban-users-dropdown">
              {formData.assigned && formData.assigned.length > 0 && (
                <div className="kanban-users-selected-list">
                  {formData.assigned.map((userId) => {
                    const selectedUser = data.users.find((u) => u.id === userId);
                    if (!selectedUser) return null;
                    return (
                      <div key={userId} className="kanban-users-selected-chip">
                        {selectedUser.avatar &&
                          (selectedUser.avatar.startsWith('http') || selectedUser.avatar.startsWith('/')) ? (
                          <img src={selectedUser.avatar} alt={selectedUser.label} className="kanban-users-menu-avatar" />
                        ) : selectedUser.avatar ? (
                          <span className="kanban-users-menu-avatar-emoji">{selectedUser.avatar}</span>
                        ) : (
                          <span className="kanban-users-menu-avatar">
                            {selectedUser.label.charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="kanban-users-selected-name">{selectedUser.label}</span>
                        <button
                          type="button"
                          className="kanban-users-selected-remove"
                          onClick={() => {
                            const currentAssigned = formData.assigned || [];
                            handleChange('assigned', currentAssigned.filter((id) => id !== userId));
                          }}
                          aria-label={t('removeUser', { label: selectedUser.label })}
                          disabled={readonly}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                className="kanban-editor-select kanban-users-trigger"
                onClick={() => setShowUsersDropdown(!showUsersDropdown)}
                disabled={readonly}
              >
                <span>
                  {formData.assigned && formData.assigned.length > 0
                    ? t('addOrRemoveUsers')
                    : t('selectUsers')}
                </span>
                <ChevronDown size={16} />
              </button>
              {!readonly && showUsersDropdown && (
                <>
                  <div
                    className="kanban-dropdown-overlay"
                    onClick={() => setShowUsersDropdown(false)}
                  />
                  <div className="kanban-users-menu">
                    {data.users.map((user) => {
                      const isAssigned = formData.assigned?.includes(user.id) || false;
                      return (
                        <button
                          key={user.id}
                          type="button"
                          className={`kanban-users-menu-item ${isAssigned ? 'selected' : ''}`}
                          onClick={() => {
                            const currentAssigned = formData.assigned || [];
                            const newAssigned = isAssigned
                              ? currentAssigned.filter((id) => id !== user.id)
                              : [...currentAssigned, user.id];
                            handleChange('assigned', newAssigned);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isAssigned}
                            onChange={() => { }}
                            className="kanban-users-checkbox"
                          />
                          {user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('/')) ? (
                            <img src={user.avatar} alt={user.label} className="kanban-users-menu-avatar" />
                          ) : user.avatar ? (
                            <span className="kanban-users-menu-avatar-emoji">{user.avatar}</span>
                          ) : (
                            <span className="kanban-users-menu-avatar">
                              {user.label.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span>{user.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="kanban-editor-field">
            <label>{t('color')}</label>
            <div className="kanban-color-input-wrapper">
              <div
                className="kanban-color-preview"
                style={{ background: formData.color || '#000000' }}
              />
              <input
                type="text"
                value={(formData.color || '').toUpperCase()}
                onChange={(e) => handleChange('color', e.target.value)}
                placeholder="#FFFFFF"
                className="kanban-editor-input kanban-color-text"
                disabled={readonly}
              />
              {!readonly && formData.color && (
                <button
                  type="button"
                  onClick={() => handleChange('color', '')}
                  className="kanban-color-clear"
                  aria-label={t('clearColor')}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {!readonly && (
              <div className="kanban-color-swatches">
              <button
                type="button"
                className="kanban-color-swatch clear"
                onClick={() => handleChange('color', '')}
                aria-label={t('clearColor')}
              >
                <X size={12} />
              </button>
              {colorOptions.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="kanban-color-swatch"
                  style={{ backgroundColor: hex }}
                  onClick={() => handleChange('color', hex)}
                  aria-label={t('setColor', { color: hex })}
                />
              ))}
              </div>
            )}
          </div>

          <div className="kanban-editor-field">
            <label>{t('links')}</label>
            <div className="kanban-links-add-row">
              <select
                className="kanban-editor-select"
                value={linkRelation}
                onChange={(e) => {
                  setLinkRelation(e.target.value);
                  if (linkError) setLinkError('');
                }}
                disabled={readonly}
              >
                <option value="">{t('selectRelation')}</option>
                {relationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                className="kanban-editor-select"
                value={linkTargetId}
                onChange={(e) => {
                  setLinkTargetId(e.target.value);
                  if (linkError) setLinkError('');
                }}
                disabled={readonly}
              >
                <option value="">{t('selectLinkedCard')}</option>
                {availableCards.map((targetCard) => (
                  <option key={targetCard.id} value={targetCard.id}>
                    {targetCard.label || t('untitled')}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="kanban-link-add-btn"
                onClick={handleAddLink}
                disabled={readonly || !linkTargetId || !linkRelation}
              >
                <Plus size={14} />
                {t('addLink')}
              </button>
            </div>
            {linkError ? <div className="kanban-link-error">{linkError}</div> : null}

            {links.length > 0 && (
              <div className="kanban-links-list">
                {links.map((link) => {
                  const target = data.cards.find((c) => c.id === link.slaveId);
                  return (
                    <div key={link.id} className="kanban-link-item">
                      <span className="kanban-link-relation">{link.relation || relationOptions[0]}</span>
                      <span className="kanban-link-target">{target?.label || t('untitled')}</span>
                      <button
                        type="button"
                        className="kanban-link-remove"
                        onClick={() => removeLink(link.id)}
                        aria-label={t('removeLink')}
                        disabled={readonly}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="kanban-editor-field">
            <label>{t('attachment')}</label>
            <div className="kanban-files-section">
              {formData.attached && formData.attached.length > 0 && (
                <div className="kanban-files-list">
                  {formData.attached.map((file, index) => (
                    <div key={index} className="kanban-file-item">
                      <div className="kanban-file-preview">
                        {isImageAttachment(file) && getAttachmentPreview(file) ? (
                          <img
                            src={getAttachmentPreview(file)}
                            alt={getAttachmentName(file)}
                          />
                        ) : (
                          <span className="kanban-file-icon">FILE</span>
                        )}
                      </div>
                      <div className="kanban-file-info">
                        <div className="kanban-file-name">{getAttachmentName(file)}</div>
                        <div className="kanban-file-size">{t('uploaded')}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="kanban-file-remove"
                        aria-label={t('removeFile')}
                        disabled={readonly}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`kanban-file-dropzone ${dragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                {!readonly && (
                  <>
                    <input
                      type="file"
                      multiple
                      onChange={async (e) => {
                        const input = e.currentTarget;
                        const files = input.files;
                        await handleFileUpload(files);
                        if (input) input.value = '';
                      }}
                      className="kanban-file-input"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="kanban-file-label">
                      {t('dropFilesHereOr')} 
                      <span className="kanban-file-link">{t('selectFiles')}</span>
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="kanban-editor-field">
            <label>{t('votes')}</label>
            <div className="kanban-vote-controls">
              <button
                type="button"
                className={`kanban-vote-btn ${myVote?.value === 1 ? 'active-up' : ''}`}
                onClick={() => handleVote(1)}
                disabled={readonly || voteBusy || !currentUserId}
              >
                <ThumbsUp size={14} />
                {t('upvote')}
              </button>
              <div className="kanban-vote-count">{voteCount}</div>
              <button
                type="button"
                className={`kanban-vote-btn ${myVote?.value === -1 ? 'active-down' : ''}`}
                onClick={() => handleVote(-1)}
                disabled={readonly || voteBusy || !currentUserId}
              >
                <ThumbsDown size={14} />
                {t('downvote')}
              </button>
            </div>
            {votes.length === 0 ? <div className="kanban-state-empty">{t('noVotesYet')}</div> : null}
          </div>

          <div className="kanban-editor-field">
            <label>{t('comments')}</label>
            <div className="kanban-editor-comments-wrap">
              {commentError ? <div className="kanban-link-error">{commentError}</div> : null}
              <div className="kanban-editor-comments">
                {comments.length === 0 ? <div className="kanban-state-empty">{t('noCommentsYet')} {t('startDiscussion')}</div> : null}
                {comments.map((comment) => {
                  const commentUser = data.users.find((u) => u.id === comment.userId);
                  return (
                    <div key={comment.id} className="kanban-editor-comment">
                      <div className="kanban-editor-comment-head">
                        {commentUser?.avatar &&
                          (commentUser.avatar.startsWith('http') || commentUser.avatar.startsWith('/')) ? (
                          <img src={commentUser.avatar} alt={commentUser.label} className="kanban-users-menu-avatar" />
                        ) : (
                          <span className="kanban-users-menu-avatar">
                            {(commentUser?.label || t('unknownUser').charAt(0)).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="kanban-editor-comment-author-meta">
                          <div className="kanban-editor-comment-author">{commentUser?.label || t('unknownUser')}</div>
                          <div className="kanban-editor-comment-meta">{getDisplayDate(comment.date)}</div>
                        </div>
                        <button
                          type="button"
                          className="kanban-comment-remove"
                          onClick={() => handleDeleteComment(comment.id)}
                          disabled={readonly || commentBusy}
                          aria-label={t('deleteComment')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      <div className="kanban-editor-comment-text">{comment.text}</div>
                    </div>
                  );
                })}
              </div>

              <div className="kanban-comment-input-row">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="kanban-editor-textarea"
                  placeholder={t('addCommentPlaceholder')}
                  rows={2}
                  disabled={readonly}
                />
                <button
                  type="button"
                  className="kanban-link-add-btn"
                  onClick={async () => {
                    await handleAddComment();
                  }}
                  disabled={readonly || !newComment.trim() || commentBusy}
                >
                  <Plus size={14} />
                  {commentBusy ? t('saving') : t('add')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="kanban-editor-footer">
          {!readonly && (
            <button onClick={handleDelete} className="kanban-editor-btn-delete">
              <Trash2 size={16} />
              {t('delete')}
            </button>
          )}
          <div className="kanban-editor-footer-spacer" />
          <button onClick={onClose} className="kanban-editor-btn-cancel">
            {t('cancel')}
          </button>
          {!readonly && (
            <button onClick={handleSave} className="kanban-editor-btn-save">
              {t('save')}
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title={t('deleteCard')}
        message={t('deleteCardMessage', { label: card?.label || '' })}
        confirmText={t('delete')}
        confirmClass="bg-red-600 hover:bg-red-700"
      />
    </>
  );
});
