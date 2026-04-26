import React, { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import {
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
  OGDialogClose,
  OGDialogFooter,
  Button,
  Label,
  Input,
  Textarea,
  Checkbox,
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
    control,
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
      <OGDialogContent className="w-[500px]">
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      </OGDialogContent>
    );
  }

  return (
    <OGDialogContent className="w-[500px]">
      <OGDialogHeader>
        <OGDialogTitle>{skillId ? 'Edit Skill' : 'Create New Skill'}</OGDialogTitle>
        <OGDialogDescription>
          Skills provide reusable context that enhances the agent's understanding of your data.
        </OGDialogDescription>
      </OGDialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <Label htmlFor="title" className="mb-1.5 text-xs">
            Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="title"
            type="text"
            {...register('title', {
              required: 'Title is required',
              maxLength: { value: 100, message: 'Title cannot exceed 100 characters' },
            })}
            placeholder="e.g., Customer Revenue Analysis"
          />
          {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>}
        </div>

        {/* Description */}
        <div>
          <Label htmlFor="description" className="mb-1.5 text-xs">
            Description <span className="text-red-500">*</span>
            <span className="ml-2 text-text-tertiary">(Used for semantic matching - max 500 chars)</span>
          </Label>
          <Textarea
            id="description"
            {...register('description', {
              required: 'Description is required',
              maxLength: { value: 500, message: 'Description cannot exceed 500 characters' },
            })}
            rows={3}
            placeholder="Brief semantic summary of what this skill provides"
          />
          {errors.description && (
            <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
          )}
        </div>

        {/* Content */}
        <div>
          <Label htmlFor="content" className="mb-1.5 text-xs">
            Content <span className="text-red-500">*</span>
            <span className="ml-2 text-text-tertiary">(SQL query or markdown documentation)</span>
          </Label>
          <Textarea
            id="content"
            {...register('content', {
              required: 'Content is required',
            })}
            rows={10}
            className="font-mono"
            placeholder="SELECT customer_id, SUM(revenue) as total_revenue&#10;FROM orders&#10;GROUP BY customer_id&#10;ORDER BY total_revenue DESC&#10;LIMIT 10;"
          />
          {errors.content && (
            <p className="mt-1 text-xs text-red-500">{errors.content.message}</p>
          )}
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2">
          <Controller
            name="isActive"
            control={control}
            render={({ field }) => (
              <Checkbox
                id="isActive"
                checked={field.value}
                onCheckedChange={field.onChange}
                aria-label="Active skill"
              />
            )}
          />
          <Label htmlFor="isActive" className="text-sm font-normal">
            Active (only active skills are used by the agent)
          </Label>
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
            variant="submit"
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

