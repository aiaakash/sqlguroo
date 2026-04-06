import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogClose,
  Spinner,
} from '@librechat/client';
import { useCreateSkill, useUpdateSkill, useAnalyticsSkill } from './hooks';
import type { TCreateSkillRequest } from 'librechat-data-provider';

interface SkillFormProps {
  skillId?: string | null;
  onClose: () => void;
}

interface FormData {
  title: string;
  description: string;
  content: string;
  isActive: boolean;
}

export default function SkillForm({ skillId, onClose }: SkillFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createSkill = useCreateSkill();
  const updateSkill = useUpdateSkill();
  const { data: existingSkill, isLoading: isLoadingSkill } = useAnalyticsSkill(skillId || '', {
    enabled: !!skillId,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    defaultValues: {
      title: '',
      description: '',
      content: '',
      isActive: true,
    },
  });

  // Load existing skill data when editing
  useEffect(() => {
    if (existingSkill && skillId) {
      reset({
        title: existingSkill.title,
        description: existingSkill.description,
        content: existingSkill.content,
        isActive: existingSkill.isActive,
      });
    }
  }, [existingSkill, skillId, reset]);

  const onSubmit = async (data: FormData) => {
    setSubmitError(null);
    try {
      if (skillId) {
        await updateSkill.mutateAsync({ id: skillId, data });
      } else {
        await createSkill.mutateAsync(data);
      }
      onClose();
    } catch (error: any) {
      setSubmitError(error?.message || 'Failed to save skill');
    }
  };

  if (isLoadingSkill && skillId) {
    return (
      <OGDialogContent className="max-w-2xl">
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      </OGDialogContent>
    );
  }

  return (
    <OGDialogContent className="max-w-2xl">
      <OGDialogHeader>
        <OGDialogTitle>{skillId ? 'Edit Skill' : 'Create New Skill'}</OGDialogTitle>
      </OGDialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            {...register('title', {
              required: 'Title is required',
              maxLength: { value: 100, message: 'Title cannot exceed 100 characters' },
            })}
            className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-surface-submit focus:outline-none"
            placeholder="e.g., Customer Revenue Analysis"
          />
          {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">
            Description <span className="text-red-500">*</span>
            <span className="ml-2 text-xs text-text-secondary">
              (Used for semantic matching - max 500 chars)
            </span>
          </label>
          <textarea
            id="description"
            {...register('description', {
              required: 'Description is required',
              maxLength: { value: 500, message: 'Description cannot exceed 500 characters' },
            })}
            rows={3}
            className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:border-surface-submit focus:outline-none resize-none"
            placeholder="Brief semantic summary of what this skill provides (e.g., 'Analyzes customer revenue trends and top customers by sales')"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
          )}
        </div>

        {/* Content */}
        <div>
          <label htmlFor="content" className="block text-sm font-medium mb-1">
            Content <span className="text-red-500">*</span>
            <span className="ml-2 text-xs text-text-secondary">
              (SQL query or markdown documentation)
            </span>
          </label>
          <textarea
            id="content"
            {...register('content', {
              required: 'Content is required',
            })}
            rows={10}
            className="w-full rounded-lg border border-border-medium bg-surface-primary px-3 py-2 text-sm font-mono focus:border-surface-submit focus:outline-none resize-none"
            placeholder="SELECT customer_id, SUM(revenue) as total_revenue&#10;FROM orders&#10;GROUP BY customer_id&#10;ORDER BY total_revenue DESC&#10;LIMIT 10;"
          />
          {errors.content && (
            <p className="mt-1 text-xs text-red-500">{errors.content.message}</p>
          )}
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            {...register('isActive')}
            className="h-4 w-4 rounded border-border-medium text-surface-submit focus:ring-surface-submit"
          />
          <label htmlFor="isActive" className="text-sm">
            Active (only active skills are used by the agent)
          </label>
        </div>

        {submitError && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <OGDialogClose asChild>
            <button
              type="button"
              className="rounded-lg border border-border-medium bg-surface-primary px-4 py-2 text-sm hover:bg-surface-hover"
            >
              Cancel
            </button>
          </OGDialogClose>
          <button
            type="submit"
            disabled={isSubmitting || createSkill.isPending || updateSkill.isPending}
            className="rounded-lg bg-surface-submit px-4 py-2 text-sm text-white hover:bg-surface-submit-hover disabled:opacity-50"
          >
            {isSubmitting || createSkill.isPending || updateSkill.isPending ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                Saving...
              </span>
            ) : skillId ? (
              'Update Skill'
            ) : (
              'Create Skill'
            )}
          </button>
        </div>
      </form>
    </OGDialogContent>
  );
}

