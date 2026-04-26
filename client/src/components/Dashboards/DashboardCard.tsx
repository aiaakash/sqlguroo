import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, MoreVertical, Copy, Trash2, Archive, LayoutDashboard } from 'lucide-react';
import type { DashboardListItem } from 'librechat-data-provider';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@librechat/client';
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
  };

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
          dashboard={dashboard}
          onEdit={(e) => handleAction(e, onEdit)}
          onDelete={(e) => handleAction(e, onDelete)}
          onDuplicate={(e) => handleAction(e, onDuplicate)}
          onToggleStar={(e) => handleAction(e, onToggleStar)}
          onArchive={(e) => handleAction(e, onArchive)}
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
            dashboard={dashboard}
            onEdit={(e) => handleAction(e, onEdit)}
            onDelete={(e) => handleAction(e, onDelete)}
            onDuplicate={(e) => handleAction(e, onDuplicate)}
            onToggleStar={(e) => handleAction(e, onToggleStar)}
            onArchive={(e) => handleAction(e, onArchive)}
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
    </div>
  );
}

function DashboardActions({
  dashboard,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleStar,
  onArchive,
}: {
  dashboard: DashboardListItem;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onToggleStar: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-lg p-1.5 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onEdit}>
            <LayoutDashboard className="h-4 w-4 text-text-secondary" />
            <span>Edit</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onToggleStar}>
            <Star className={cn('h-4 w-4 text-text-secondary', dashboard.starred && 'fill-amber-500 text-amber-500')} />
            <span>{dashboard.starred ? 'Unstar' : 'Star'}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="h-4 w-4 text-text-secondary" />
            <span>Duplicate</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="h-4 w-4 text-text-secondary" />
            <span>{dashboard.isArchived ? 'Unarchive' : 'Archive'}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
