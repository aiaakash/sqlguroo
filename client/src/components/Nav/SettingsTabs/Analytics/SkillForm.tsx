import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogClose,
  OGDialogFooter,
  Button,
  Spinner,
} from '@librechat/client';
import { useCreateSkill, useUpdateSkill, useAnalyticsSkill } from './hooks';

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
      <OGDialogContent className="w-[500px] !bg-card">
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      </OGDialogContent>
    );
  }

  return (
    <OGDialogContent className="w-[500px] !bg-card">
      <OGDialogHeader>
        <OGDialogTitle>{skillId ? 'Edit Skill' : 'Create New Skill'}</OGDialogTitle>
      </OGDialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <label htmlFor="title" className="mb-1 block text-xs font-medium text-text-secondary">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="title"
            type="text"
            {...register('title', {
              required: 'Title is required',
              maxLength: { value: 100, message: 'Title cannot exceed 100 characters' },
            })}
            className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1"
            placeholder="e.g., Customer Revenue Analysis"
          />
          {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1 block text-xs font-medium text-text-secondary">
            Description <span className="text-red-500">*</span>
            <span className="ml-2 text-text-tertiary">(Used for semantic matching - max 500 chars)</span>
          </label>
          <textarea
            id="description"
            {...register('description', {
              required: 'Description is required',
              maxLength: { value: 500, message: 'Description cannot exceed 500 characters' },
            })}
            rows={3}
            className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-1 resize-none"
            placeholder="Brief semantic summary of what this skill provides"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
          )}
        </div>

        {/* Content */}
        <div>
          <label htmlFor="content" className="mb-1 block text-xs font-medium text-text-secondary">
            Content <span className="text-red-500">*</span>
            <span className="ml-2 text-text-tertiary">(SQL query or markdown documentation)</span>
          </label>
          <textarea
            id="content"
            {...register('content', {
              required: 'Content is required',
            })}
            rows={10}
            className="focus:border-border-focus focus:ring-border-focus w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 resize-none"
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
            className="h-4 w-4 rounded border-border-medium text-primary focus:ring-primary"
          />
          <label htmlFor="isActive" className="text-sm text-text-primary">
            Active (only active skills are used by the agent)
          </label>
        </div>

        {submitError && (
          <div className="rounded-lg bg-red-100 p-3 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">
            {submitError}
          </div>
        )}

        <OGDialogFooter className="flex gap-2">
          <OGDialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </OGDialogClose>
          <Button
            type="submit"
            disabled={isSubmitting || createSkill.isPending || updateSkill.isPending}
          >
            {isSubmitting || createSkill.isPending || updateSkill.isPending ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving...
              </>
            ) : skillId ? (
              'Update Skill'
            ) : (
              'Create Skill'
            )}
          </Button>
        </OGDialogFooter>
      </form>
    </OGDialogContent>
  );
}

