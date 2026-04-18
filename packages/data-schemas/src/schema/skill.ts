import { Schema } from 'mongoose';
import type { ISkill } from '~/types';
import { nanoid } from 'nanoid';

const skillSchema = new Schema<ISkill>(
  {
    skillId: {
      type: String,
      required: true,
      unique: true,
      default: () => nanoid(),
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Skill title is required'],
      trim: true,
      maxlength: [100, 'Skill title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Skill description is required'],
      trim: true,
      maxlength: [500, 'Skill description cannot exceed 500 characters'],
    },
    content: {
      type: String,
      required: [true, 'Skill content is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      index: true,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    embedding: {
      type: [Number],
      default: undefined,
      select: false, // Don't include embeddings by default (they're large)
    },
    embeddingUpdatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient lookups of user's active skills
skillSchema.index({ userId: 1, isActive: 1 });

// Index for semantic search (when embeddings are available)
skillSchema.index({ userId: 1, isActive: 1, embeddingUpdatedAt: 1 });

// Index for organization-scoped queries
skillSchema.index({ organizationId: 1, isActive: 1 });

export default skillSchema;

