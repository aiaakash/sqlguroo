import { Schema } from 'mongoose';
import type { ISubscription } from '~/types';

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    paddleCustomerId: {
      type: String,
      index: true,
    },
    paddleSubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'ultra'],
      default: 'free',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'past_due', 'paused', 'trialing', 'expired'],
      default: 'active',
      required: true,
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual', 'none'],
      default: 'none',
    },
    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    cancelledAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient querying
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, createdAt: -1 });

export default subscriptionSchema;

