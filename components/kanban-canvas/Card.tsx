'use client';

import { memo } from 'react';
import type { Card as CardType, CardAttachment } from '@/types/kanban-canvas';
import { MoreVertical, Calendar, MessageCircle, ThumbsUp, Paperclip } from 'lucide-react';
import { useKanbanUI } from './store';
import { useKanbanI18n } from './useKanbanI18n';

type CardRenderer = (props: {
  card: CardType;
  users: Array<{ id: string; label: string; avatar?: string }>;
  onClick?: () => void;
  onMenuClick?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  readonly?: boolean;
}) => React.ReactNode;

interface CardProps {
  card: CardType;
  onClick?: () => void;
  onMenuClick?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  users?: Array<{ id: string; label: string; avatar?: string }>;
  readonly?: boolean;
  cardRenderer?: CardRenderer;
}

export const Card = memo(function Card({
  card,
  onClick,
  onMenuClick,
  isSelected = false,
  users = [],
  readonly = false,
  cardRenderer,
}: CardProps) {
  const ui = useKanbanUI();
  const { t } = useKanbanI18n();

  if (cardRenderer) {
    return <>{cardRenderer({ card, users, onClick, onMenuClick, isSelected, readonly })}</>;
  }

  const assignedUsers = users.filter((u) => card.assigned?.includes(u.id));
  const voteCount = card.votes?.reduce((sum, v) => sum + v.value, 0) || 0;
  const commentCount = card.comments?.length || 0;
  const attachments = card.attached || [];

  const getAttachmentUrl = (file: string | CardAttachment) => {
    if (typeof file === 'string') return file;
    return file.coverURL || file.previewURL || file.url || '';
  };

  const isImageAttachment = (file: string | CardAttachment) => {
    if (typeof file === 'string') {
      return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(file);
    }
    if (file.type) return file.type.startsWith('image/');
    const src = getAttachmentUrl(file);
    return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(src);
  };

  const coverAttachment =
    attachments.find(
      (file) =>
        typeof file !== 'string' &&
        file.isCover &&
        isImageAttachment(file) &&
        Boolean(getAttachmentUrl(file))
    ) ||
    attachments.find((file) => isImageAttachment(file) && Boolean(getAttachmentUrl(file)));

  const coverUrl = coverAttachment ? getAttachmentUrl(coverAttachment) : '';
  const fileAttachments = attachments.filter((file) => !isImageAttachment(file));

  const openFirstFileAttachment = (e: React.MouseEvent) => {
    e.stopPropagation();
    const firstFile = fileAttachments.find((file) => {
      const url = getAttachmentUrl(file);
      return Boolean(url);
    });
    if (!firstFile) return;
    const url = getAttachmentUrl(firstFile);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const normalizeCardColor = (value?: string) => {
    if (!value) return '';
    const trimmed = String(value).trim();
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
    if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return `#${trimmed}`;
    return '';
  };

  const parseCardDate = (value?: string) => {
    if (!value) return null;
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
    const match = value.match(dateOnly);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      return new Date(year, month, day);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatCardDate = (value?: string) => {
    const parsed = parseCardDate(value);
    if (!parsed) return '';
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    if (ui.dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${yyyy}`;
    if (ui.dateFormat === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  };

  const startDateLabel = formatCardDate(card.start_date);
  const endDateLabel = formatCardDate(card.end_date);
  const cardDateLabel = startDateLabel && endDateLabel
    ? `${startDateLabel} - ${endDateLabel}`
    : startDateLabel || endDateLabel;

  const stripColor = normalizeCardColor(card.color);

  return (
    <div
      className={`kanban-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {stripColor && (
        <div
          className="kanban-card-top-strip"
          style={{ backgroundColor: stripColor }}
          aria-hidden="true"
        />
      )}

      <div className="kanban-card-header">
        <div className="kanban-card-title">{card.label}</div>
        {card.priority && (
          <span className={`kanban-card-priority ${card.priority}`}>
            {card.priority}
          </span>
        )}
        {!readonly && onMenuClick && (
          <button
            className="kanban-card-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick(e);
            }}
            aria-label={t('cardMenu')}
          >
            <MoreVertical size={16} />
          </button>
        )}
      </div>

      {card.description && (
        <div className="kanban-card-description">{card.description}</div>
      )}

      {coverUrl && (
        <div className="kanban-card-cover-wrap">
          <img src={coverUrl} alt={card.label || t('cardImage')} className="kanban-card-cover" />
        </div>
      )}

      {card.progress !== undefined && (
        <div className="kanban-card-progress-wrapper">
          <div className="kanban-card-progress-label">{t('progress')} {card.progress || 0}%</div>
          <div className="kanban-card-progress">
            <div
              className="kanban-card-progress-bar"
              style={{ width: `${card.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="kanban-card-meta">
        {cardDateLabel && (
          <div className="kanban-card-date">
            <Calendar size={12} />
            <span>{cardDateLabel}</span>
          </div>
        )}

        {card.projectId && (
          <div className="kanban-card-badge">
            <span>{card.projectId}</span>
          </div>
        )}

        {assignedUsers.length > 0 && (
          <div className="kanban-card-avatars">
            {assignedUsers.slice(0, 3).map((user) => (
              <div
                key={user.id}
                className="kanban-card-avatar"
                title={user.label}
              >
                {user.avatar || user.label.charAt(0)}
              </div>
            ))}
            {assignedUsers.length > 3 && (
              <div className="kanban-card-avatar-more">
                +{assignedUsers.length - 3}
              </div>
            )}
          </div>
        )}

        {fileAttachments.length > 0 && (
          <button
            type="button"
            className="kanban-card-badge kanban-card-badge-link"
            onClick={openFirstFileAttachment}
            aria-label={t('openAttachedFile')}
            title={t('openAttachedFile')}
          >
            <Paperclip size={12} />
            <span>{fileAttachments.length}</span>
          </button>
        )}

        {commentCount > 0 && (
          <div className="kanban-card-badge">
            <MessageCircle size={12} />
            <span>{commentCount}</span>
          </div>
        )}

        {voteCount !== 0 && (
          <div className="kanban-card-badge">
            <ThumbsUp size={12} />
            <span>{voteCount}</span>
          </div>
        )}
      </div>
    </div>
  );
});
