import { Schema } from 'mongoose';
import type { IUsage } from '~/types';

const usageSchema = new Schema<IUsage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    queryCount: {
      type: Number,
      default: 0,
      required: true,
    },
    lastQueryAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient period-based queries
usageSchema.index({ userId: 1, periodStart: 1 }, { unique: true });
usageSchema.index({ userId: 1, periodEnd: 1 });

export default usageSchema;

