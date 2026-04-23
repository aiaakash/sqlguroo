import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Star, MoreVertical, Copy, Trash2, Archive, LayoutDashboard } from 'lucide-react';
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

  if (viewMode === 'list') {
    return (
      <div
        onClick={handleClick}
        className="group flex cursor-pointer items-center gap-4 rounded-xl border border-border-light/60 bg-surface-primary p-4 shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-md"
      >
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10">
          <DashboardIcon icon={dashboard.icon} className="text-primary" size={20} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
              {dashboard.name}
            </h3>
            <OrgBadge organizationId={dashboard.organizationId} />
            {dashboard.starred && (
              <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/10">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
              </div>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-text-tertiary">
            <span className="font-medium">{dashboard.chartCount} charts</span>
            <span className="h-1 w-1 rounded-full bg-border-medium" />
            <span>{new Date(dashboard.updatedAt).toLocaleDateString()}</span>
          </div>
        </div>

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

  return (
    <div
      onClick={handleClick}
      className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-light/60 bg-surface-primary shadow-sm transition-all duration-200 hover:border-border-medium hover:shadow-md"
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-surface-secondary to-surface-tertiary/50 p-3">
        <div className="grid h-full w-full grid-cols-4 grid-rows-3 gap-2">
          {dashboard.chartPreviews.slice(0, 4).map((preview, idx) => (
            <div
              key={preview._id}
              className={cn(
                'rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/10',
                idx === 0 ? 'col-span-2 row-span-2' : '',
              )}
            />
          ))}
          {Array.from({ length: Math.max(0, 4 - dashboard.chartPreviews.length) }).map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className={cn(
                'rounded-lg bg-surface-tertiary/50',
                idx === 0 ? 'col-span-2 row-span-2' : '',
              )}
            />
          ))}
        </div>

        {dashboard.starred && (
          <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="line-clamp-1 flex-1 text-sm font-semibold text-text-primary">
              {dashboard.name}
            </h3>
            <OrgBadge organizationId={dashboard.organizationId} />
          </div>
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

        {dashboard.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {dashboard.description}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-2">
          <span className="inline-flex items-center rounded-lg bg-surface-secondary px-2 py-1 text-[11px] font-medium text-text-secondary ring-1 ring-border-light/50">
            {dashboard.chartCount} charts
          </span>
          <span className="ml-auto text-[11px] text-text-tertiary">
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
          className="rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
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
              className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-border-light/60 bg-surface-primary shadow-xl ring-1 ring-black/5"
              style={{
                top: `${dropdownPosition.top}px`,
                right: `${dropdownPosition.right}px`,
              }}
            >
              <div className="p-1">
                <button
                  onClick={(e) => handleAction(e, onEdit)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <LayoutDashboard className="h-4 w-4 text-text-secondary" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={(e) => handleAction(e, onToggleStar)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Star className={cn('h-4 w-4 text-text-secondary', dashboard.starred && 'fill-amber-500 text-amber-500')} />
                  <span>{dashboard.starred ? 'Unstar' : 'Star'}</span>
                </button>
                <div className="my-1 h-px bg-border-light/60" />
                <button
                  onClick={(e) => handleAction(e, onDuplicate)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Copy className="h-4 w-4 text-text-secondary" />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={(e) => handleAction(e, onArchive)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
                >
                  <Archive className="h-4 w-4 text-text-secondary" />
                  <span>{dashboard.isArchived ? 'Unarchive' : 'Archive'}</span>
                </button>
                <div className="my-1 h-px bg-border-light/60" />
                <button
                  onClick={(e) => handleAction(e, onDelete)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

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
    className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-border-light/60 bg-surface-primary shadow-xl ring-1 ring-black/5"
    style={{ top: `${position.top}px`, right: `${position.right}px` }}
  >
    <div className="p-1">
      <button
        onClick={onEdit}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
      >
        <LayoutDashboard className="h-4 w-4 text-text-secondary" />
        <span>Edit</span>
      </button>
      <button
        onClick={onToggleStar}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
      >
        <Star className={cn('h-4 w-4 text-text-secondary', dashboard.starred && 'fill-amber-500 text-amber-500')} />
        <span>{dashboard.starred ? 'Unstar' : 'Star'}</span>
      </button>
      <div className="my-1 h-px bg-border-light/60" />
      <button
        onClick={onDuplicate}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
      >
        <Copy className="h-4 w-4 text-text-secondary" />
        <span>Duplicate</span>
      </button>
      <button
        onClick={onArchive}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-surface-hover"
      >
        <Archive className="h-4 w-4 text-text-secondary" />
        <span>{dashboard.isArchived ? 'Unarchive' : 'Archive'}</span>
      </button>
      <div className="my-1 h-px bg-border-light/60" />
      <button
        onClick={onDelete}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
      >
        <Trash2 className="h-4 w-4" />
        <span>Delete</span>
      </button>
    </div>
  </div>
));

DropdownMenu.displayName = 'DropdownMenu';
