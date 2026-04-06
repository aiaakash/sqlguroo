import { Schema } from 'mongoose';
import type { IAnalyticsQuery } from '~/types';

const analyticsQuerySchema = new Schema<IAnalyticsQuery>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      required: true,
      unique: true,
    },
    connectionId: {
      type: String,
      required: true,
      index: true,
    },
    question: {
      type: String,
      required: [true, 'Question is required'],
      maxlength: [10000, 'Question cannot exceed 10000 characters'],
    },
    generatedSql: {
      type: String,
      required: [true, 'Generated SQL is required'],
    },
    userApproved: {
      type: Boolean,
      default: false,
    },
    executedSql: {
      type: String,
    },
    executionTimeMs: {
      type: Number,
    },
    rowCount: {
      type: Number,
    },
    results: {
      type: [Schema.Types.Mixed],
      default: undefined,
      select: false, // Don't include results by default (can be large)
    },
    error: {
      type: String,
    },
    success: {
      type: Boolean,
      default: false,
    },
    tokensUsed: {
      type: Number,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for efficient queries
analyticsQuerySchema.index({ user: 1, conversationId: 1 });
analyticsQuerySchema.index({ connectionId: 1, createdAt: -1 });
analyticsQuerySchema.index({ user: 1, createdAt: -1 });

export default analyticsQuerySchema;

