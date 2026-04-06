import type { Document, ObjectId } from 'mongoose';

export enum SubscriptionPlan {
  FREE = 'free',
  PRO = 'pro',
  ULTRA = 'ultra',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  PAST_DUE = 'past_due',
  PAUSED = 'paused',
  TRIALING = 'trialing',
  EXPIRED = 'expired',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  ANNUAL = 'annual',
  NONE = 'none',
}

export interface ISubscription extends Document {
  _id: ObjectId;
  userId: ObjectId;
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  plan: SubscriptionPlan | string;
  status: SubscriptionStatus | string;
  billingCycle: BillingCycle | string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUsage extends Document {
  _id: ObjectId;
  userId: ObjectId;
  periodStart: Date;
  periodEnd: Date;
  queryCount: number;
  lastQueryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 5,
  [SubscriptionPlan.PRO]: 200,
  [SubscriptionPlan.ULTRA]: 650,
};

export const PLAN_NAMES: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.FREE]: 'Free',
  [SubscriptionPlan.PRO]: 'Pro',
  [SubscriptionPlan.ULTRA]: 'Ultra',
};

export const PLAN_PRICES = {
  [SubscriptionPlan.PRO]: {
    monthly: 29,
    annual: 290,
  },
  [SubscriptionPlan.ULTRA]: {
    monthly: 79,
    annual: 790,
  },
};

