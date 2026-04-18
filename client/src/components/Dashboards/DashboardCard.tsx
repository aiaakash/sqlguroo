import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Star, MoreVertical, Copy, Trash2, Edit2, Archive, LayoutDashboard } from 'lucide-react';
import type { DashboardListItem } from 'librechat-data-provider';
import DashboardIcon from './DashboardIcon';
import { OrgBadge } from '~/components/Organization';
import { cn } from '~/utils';

interface DashboardCardProps {
  dashboard: DashboardListItem;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  viewMode: 'grid' | 'list';
  loadingActions?: Set<string>;
}

export default function DashboardCard({
  dashboard,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStar,
  onArchive,
  viewMode,
  loadingActions = new Set(),
}: DashboardCardProps) {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });

  const isDeleting = loadingActions.has(`delete-${dashboard._id}`);
  const isDuplicating = loadingActions.has(`duplicate-${dashboard._id}`);
  const isStarring = loadingActions.has(`star-${dashboard._id}`);
  const isArchiving = loadingActions.has(`archive-${dashboard._id}`);
  const isLoading = isDeleting || isDuplicating || isStarring || isArchiving;

  const handleClick = () => {
    navigate(`/d/dashboards/${dashboard._id}`);
  };

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setIsMenuOpen(false);
  };

  useEffect(() => {
    if (isMenuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        right: window.innerWidth - rect.right - window.scrollX,
      });
    }
  }, [isMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMenuOpen]);

  const chartTypeColors: Record<string, string> = {
    bar: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    line: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    area: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    pie: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    scatter: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
    radar: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',
  };

  if (viewMode === 'list') {
    return (
      <div
        onClick={handleClick}
        className="dark:border-border-dark group flex cursor-pointer items-center gap-4 rounded-lg border border-border-light bg-surface-primary p-3 transition-colors hover:bg-surface-hover"
      >
        {/* Icon */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
          <LayoutDashboard className="h-5 w-5 text-blue-500" />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate font-medium text-text-primary">
              {dashboard.name}
            </h3>
            <OrgBadge organizationId={dashboard.organizationId} />
            {dashboard.starred && (
              <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
            <span className="whitespace-nowrap">{dashboard.chartCount} charts</span>
            <span className="whitespace-nowrap">·</span>
            <span className="whitespace-nowrap">
              {new Date(dashboard.updatedAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Actions */}
        <DashboardActions
          isOpen={isMenuOpen}
          setIsOpen={setIsMenuOpen}
          buttonRef={buttonRef}
          dropdownRef={dropdownRef}
          dropdownPosition={dropdownPosition}
          dashboard={dashboard}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onToggleStar={onToggleStar}
          onArchive={onArchive}
        />
      </div>
    );
  }

  // Grid view
  return (
    <div
      onClick={handleClick}
      className="dark:border-border-dark group relative cursor-pointer overflow-hidden rounded-lg border border-border-light bg-surface-primary transition-shadow hover:shadow-lg"
    >
      {/* Preview Area */}
      <div className="relative h-40 overflow-hidden bg-surface-secondary p-2">
        {/* Chart preview grid */}
        <div className="grid h-full w-full grid-cols-4 grid-rows-3 gap-2">
          {dashboard.chartPreviews.slice(0, 4).map((preview, idx) => (
            <div
              key={preview._id}
              className={cn(
                'rounded-md',
                idx === 0 ? 'col-span-2 row-span-2' : '',
                chartTypeColors[preview.config.type] || 'bg-surface-primary/50',
              )}
            />
          ))}
          {Array.from({ length: Math.max(0, 4 - dashboard.chartPreviews.length) }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className={cn(
                'bg-surface-primary/50 rounded-md',
                idx === 0 ? 'col-span-2 row-span-2' : '',
              )}
            />
          ))}
        </div>

        {/* Star */}
        {dashboard.starred && (
          <div className="absolute right-2 top-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
          </div>
        )}
      </div>

      {/* Card Info */}
      <div className="p-3">
        <div className="mb-1 flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 min-w-0 flex-1 font-medium text-text-primary">
            {dashboard.name}
          </h3>
          <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              ref={buttonRef}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-hover group-hover:opacity-100"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>
        {dashboard.description && (
          <p className="mb-2 line-clamp-2 text-xs text-text-secondary">{dashboard.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
          <span className="whitespace-nowrap">{dashboard.chartCount} charts</span>
          <span className="whitespace-nowrap">·</span>
          <span className="whitespace-nowrap">
            {new Date(dashboard.updatedAt).toLocaleDateString()}
          </span>
        </div>
      </div>

      {isMenuOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
            <DropdownMenu
              ref={dropdownRef}
              position={dropdownPosition}
              dashboard={dashboard}
              onEdit={(e) => handleAction(e, onEdit)}
              onDelete={(e) => handleAction(e, onDelete)}
              onDuplicate={(e) => handleAction(e, onDuplicate)}
              onToggleStar={(e) => handleAction(e, onToggleStar)}
              onArchive={(e) => handleAction(e, onArchive)}
            />
          </>,
          document.body,
        )}
    </div>
  );
}

// Actions component for list view
function DashboardActions({
  isOpen,
  setIsOpen,
  buttonRef,
  dropdownRef,
  dropdownPosition,
  dashboard,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStar,
  onArchive,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
  dropdownRef: React.RefObject<HTMLDivElement>;
  dropdownPosition: { top: number; right: number };
  dashboard: DashboardListItem;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
}) {
  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    setIsOpen(false);
  };

  return (
    <>
      <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="rounded p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-surface-hover group-hover:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      {isOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div
              ref={dropdownRef}
              className="dark:border-border-dark dark:bg-surface-primary-dark fixed z-[100] w-36 rounded-lg border border-border-light bg-surface-primary py-1 shadow-xl"
              style={{
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
              <button
                onClick={(e) => handleAction(e, onEdit)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Edit2 className="h-4 w-4 flex-shrink-0" />
                <span>Edit</span>
              </button>
              <button
                onClick={(e) => handleAction(e, onToggleStar)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Star
                  className={cn(
                    'h-4 w-4 flex-shrink-0',
                    dashboard.starred && 'fill-amber-400 text-amber-400',
                  )}
                />
                <span>{dashboard.starred ? 'Unstar' : 'Star'}</span>
              </button>
              <button
                onClick={(e) => handleAction(e, onDuplicate)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Copy className="h-4 w-4 flex-shrink-0" />
                <span>Duplicate</span>
              </button>
              <button
                onClick={(e) => handleAction(e, onArchive)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
              >
                <Archive className="h-4 w-4 flex-shrink-0" />
                <span>{dashboard.isArchived ? 'Unarchive' : 'Archive'}</span>
              </button>
              <div className="dark:border-border-dark my-1 border-t border-border-light" />
              <button
                onClick={(e) => handleAction(e, onDelete)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-surface-hover"
              >
                <Trash2 className="h-4 w-4 flex-shrink-0" />
                <span>Delete</span>
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

// Dropdown menu component for grid view
const DropdownMenu = React.forwardRef<
  HTMLDivElement,
  {
    position: { top: number; right: number };
    dashboard: DashboardListItem;
    onEdit: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    onDuplicate: (e: React.MouseEvent) => void;
    onToggleStar: (e: React.MouseEvent) => void;
    onArchive: (e: React.MouseEvent) => void;
  }
>(({ position, dashboard, onEdit, onDelete, onDuplicate, onToggleStar, onArchive }, ref) => (
  <div
    ref={ref}
    className="dark:border-border-dark dark:bg-surface-primary-dark fixed z-[100] w-36 rounded-lg border border-border-light bg-surface-primary py-1 shadow-xl"
    style={{ top: `${position.top}px`, right: `${position.right}px` }}
  >
    <button
      onClick={onEdit}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
    >
      <Edit2 className="h-4 w-4" />
      <span>Edit</span>
    </button>
    <button
      onClick={onToggleStar}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
    >
      <Star className={cn('h-4 w-4', dashboard.starred && 'fill-amber-400 text-amber-400')} />
      <span>{dashboard.starred ? 'Unstar' : 'Star'}</span>
    </button>
    <button
      onClick={onDuplicate}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
    >
      <Copy className="h-4 w-4" />
      <span>Duplicate</span>
    </button>
    <div className="dark:border-border-dark my-1 border-t border-border-light" />
    <button
      onClick={onArchive}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-text-primary hover:bg-surface-hover"
    >
      <Archive className="h-4 w-4" />
      <span>{dashboard.isArchived ? 'Unarchive' : 'Archive'}</span>
    </button>
    <button
      onClick={onDelete}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-surface-hover"
    >
      <Trash2 className="h-4 w-4" />
      <span>Delete</span>
    </button>
  </div>
));

DropdownMenu.displayName = 'DropdownMenu';
