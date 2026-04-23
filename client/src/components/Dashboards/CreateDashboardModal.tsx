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
        className="w-full max-w-lg overflow-hidden rounded-xl rounded-b-lg bg-card p-0 shadow-2xl backdrop-blur-2xl"
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Create Dashboard</h2>
            <p className="mt-0.5 text-sm text-text-secondary">
              Organize your charts into a dashboard
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-sm p-1.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-border-xheavy focus:ring-offset-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-text-primary"
            >
              <line x1="18" x2="6" y1="6" y2="18"></line>
              <line x1="6" x2="18" y1="6" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(90vh-120px)] overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
            <div className="pb-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-text-primary">
                  Dashboard Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Analytics Dashboard"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:ring-ring-primary focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="pb-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-text-primary">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A collection of key metrics and insights..."
                  rows={3}
                  className="resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary transition-all focus:ring-ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="pb-3">
              <div className="flex items-center justify-between">
                <div>Icon</div>
                <div className="grid grid-cols-8 gap-1.5">
                  {DASHBOARD_ICONS.map(({ icon: iconValue, label }) => (
                    <button
                      key={iconValue}
                      type="button"
                      onClick={() => setIcon(iconValue)}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg transition-all',
                        icon === iconValue
                          ? 'bg-primary text-white'
                          : 'bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                      )}
                      title={label}
                    >
                      <DashboardIconComponent icon={iconValue} size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pb-3">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-text-primary">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm text-primary"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="rounded-full p-0.5 hover:bg-primary/20"
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
                      className="w-24 rounded-lg border border-border-light bg-surface-secondary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-medium focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="rounded-lg bg-surface-secondary p-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-border-light pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition-all hover:bg-surface-hover hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || createMutation.isLoading}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
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
