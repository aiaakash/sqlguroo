import React, { useState } from 'react';
import { BookOpen, Plus, Trash2, Edit2, AlertTriangle } from 'lucide-react';
import { useLocalize } from '~/hooks';
import {
  OGDialog,
  OGDialogTrigger,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogDescription,
  OGDialogClose,
  OGDialogFooter,
  Spinner,
  Button,
} from '@librechat/client';
import SkillForm from '~/components/Nav/SettingsTabs/Analytics/SkillForm';
import { useAnalyticsSkills, useDeleteSkill } from '~/components/Nav/SettingsTabs/Analytics/hooks';
import { OrgBadge } from '~/components/Organization';

export default function SkillsPanel() {
  const localize = useLocalize();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<string | null>(null);

  const { data: skills, isLoading, refetch } = useAnalyticsSkills();
  const deleteSkill = useDeleteSkill();

  const handleDeleteClick = (skillId: string) => {
    setSkillToDelete(skillId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (skillToDelete) {
      await deleteSkill.mutateAsync(skillToDelete);
      setDeleteDialogOpen(false);
      setSkillToDelete(null);
    }
  };

  const handleEdit = (skillId: string) => {
    setEditingSkill(skillId);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingSkill(null);
    refetch();
  };

  const handleAddNew = () => {
    setEditingSkill(null);
    setIsFormOpen(true);
  };

  return (
    <div className="flex h-auto max-w-full flex-col gap-3 overflow-x-hidden p-3 text-sm text-text-primary">
      <div className="border-b border-border-medium pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="icon-md" />
            <span className="font-medium">Skills</span>
          </div>
          <OGDialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <OGDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleAddNew}
              >
                <Plus className="h-4 w-4" />
                Add Skill
              </Button>
            </OGDialogTrigger>
            <SkillForm skillId={editingSkill} onClose={handleCloseForm} />
          </OGDialog>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          Create reusable context blocks that enhance the agent's understanding of your data
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : skills && skills.length > 0 ? (
        <div className="flex flex-col gap-2">
          {skills.map((skill) => (
            <div
              key={skill._id}
              className="flex items-start justify-between rounded-xl border border-border-light bg-surface-secondary p-3"
            >
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{skill.title}</span>
                  <OrgBadge organizationId={skill.organizationId} />
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs flex-shrink-0 ${
                      skill.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {skill.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 mb-1">{skill.description}</p>
                <p className="text-xs text-text-tertiary font-mono line-clamp-2 break-all">
                  {skill.content}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleEdit(skill.skillId)}
                  title="Edit skill"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteClick(skill.skillId)}
                  disabled={deleteSkill.isPending}
                  className="text-red-500 hover:text-red-600"
                  title="Delete skill"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-surface-secondary/50 flex flex-col items-center justify-center rounded-xl border border-dashed border-border-light py-8 text-center">
          <BookOpen className="mb-2 h-8 w-8 text-text-tertiary" />
          <p className="text-text-secondary">No skills created yet</p>
          <p className="text-xs text-text-tertiary">
            Create skills to provide context that helps the agent understand your data better
          </p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <OGDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <OGDialogContent className="w-[400px]">
          <OGDialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <OGDialogTitle>Delete Skill</OGDialogTitle>
            </div>
          </OGDialogHeader>
          <OGDialogDescription className="text-sm text-text-secondary">
            Are you sure you want to delete this skill? This action cannot be undone.
          </OGDialogDescription>
          <OGDialogFooter>
            <OGDialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </OGDialogClose>
            <Button type="button" variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </OGDialogFooter>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}

