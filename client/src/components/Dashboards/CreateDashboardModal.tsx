import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useCreateDashboardMutation } from 'librechat-data-provider';
import type { DashboardIcon as DashboardIconType } from 'librechat-data-provider';
import { OGDialog, OGDialogContent } from '@librechat/client';
import DashboardIconComponent from './DashboardIcon';
import { DASHBOARD_ICONS } from './types';
import { cn } from '~/utils';

interface CreateDashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (dashboardId: string) => void;
}

export default function CreateDashboardModal({
  open,
  onOpenChange,
  onSuccess,
}: CreateDashboardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<DashboardIconType>('dashboard');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const createMutation = useCreateDashboardMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      const dashboard = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        icon,
        tags: tags.length > 0 ? tags : undefined,
      });
      onOpenChange(false);
      resetForm();
      onSuccess?.(dashboard._id);
    } catch (error) {
      console.error('Failed to create dashboard:', error);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('dashboard');
    setTags([]);
    setTagInput('');
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border-light bg-surface-primary p-0 shadow-xl dark:border-border-dark dark:bg-surface-primary-dark"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-light px-6 py-4 dark:border-border-dark">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Create Dashboard</h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              Organize your charts into a dashboard
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          {/* Name */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-text-primary">
              Dashboard Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Analytics Dashboard"
              className="w-full rounded-lg border border-border-light bg-surface-secondary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-border-dark dark:bg-surface-secondary-dark"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-text-primary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of key metrics and insights..."
              rows={3}
              className="w-full resize-none rounded-lg border border-border-light bg-surface-secondary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-border-dark dark:bg-surface-secondary-dark"
            />
          </div>

          {/* Icon Selection */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-text-primary">Icon</label>
            <div className="grid grid-cols-8 gap-2">
              {DASHBOARD_ICONS.map(({ icon: iconValue, label }) => (
                <button
                  key={iconValue}
                  type="button"
                  onClick={() => setIcon(iconValue)}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
                    icon === iconValue
                      ? 'bg-blue-600 text-white'
                      : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:bg-surface-secondary-dark'
                  )}
                  title={label}
                >
                  <DashboardIconComponent icon={iconValue} size={18} />
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-text-primary">Tags</label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="rounded-full p-0.5 hover:bg-blue-500/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add tag..."
                  className="w-24 rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-border-dark dark:bg-surface-secondary-dark"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="rounded-lg bg-surface-secondary p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary dark:bg-surface-secondary-dark"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isLoading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Dashboard
                </>
              )}
            </button>
          </div>
        </form>
      </OGDialogContent>
    </OGDialog>
  );
}

