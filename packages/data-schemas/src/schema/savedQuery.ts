import { Schema } from 'mongoose';
import type { ISavedQuery } from '~/types';

const savedQuerySchema = new Schema<ISavedQuery>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Query name is required'],
      maxlength: [100, 'Query name cannot exceed 100 characters'],
      trim: true,
    },
    sqlContent: {
      type: String,
      required: [true, 'SQL content is required'],
      maxlength: [50000, 'SQL content cannot exceed 50000 characters'],
    },
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      trim: true,
    },
    conversationId: {
      type: String,
      index: true,
    },
    messageId: {
      type: String,
      index: true,
    },
    connectionId: {
      type: String,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
savedQuerySchema.index({ userId: 1, createdAt: -1 });
savedQuerySchema.index({ userId: 1, name: 1 });
savedQuerySchema.index({ userId: 1, updatedAt: -1 });

// Text index for search
savedQuerySchema.index({ name: 'text', description: 'text', sqlContent: 'text' });

export default savedQuerySchema;
