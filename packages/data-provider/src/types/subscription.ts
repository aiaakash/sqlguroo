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

export interface ISubscription {
  _id?: string;
  userId: string;
  paddleCustomerId?: string;
  paddleSubscriptionId?: string;
  plan: SubscriptionPlan | string;
  status: SubscriptionStatus | string;
  billingCycle: BillingCycle | string;
  currentPeriodStart?: Date | string;
  currentPeriodEnd?: Date | string;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date | string;
  metadata?: Record<string, unknown>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  isImplicit?: boolean;
}

export interface IUsage {
  _id?: string;
  userId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  queryCount: number;
  lastQueryAt?: Date | string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface IUsageStats {
  queryCount: number;
  limit: number;
  percentage: number;
  periodStart: Date | string;
  periodEnd: Date | string;
  lastQueryAt?: Date | string;
}

export interface IPlanFeatures {
  queryLimit: number | string;
  features: string[];
}

export interface IPlanInfo {
  id: SubscriptionPlan;
  name: string;
  price?: number;
  prices?: {
    monthly: number;
    annual: number;
  };
  queryLimit: number | string;
  features: string[];
}

export interface ISubscriptionResponse {
  subscription: ISubscription;
  usage: IUsageStats;
}

export interface IPlansResponse {
  plans: IPlanInfo[];
}

export interface ICheckoutRequest {
  plan: SubscriptionPlan | string;
  billingCycle: BillingCycle | string;
}

export interface ICheckoutResponse {
  data: {
    id: string;
    status?: string;
    checkout?: {
      url?: string;
    };
    [key: string]: unknown;
  };
  checkout: {
    id: string;
    url?: string;
  };
}

export interface IChangePlanRequest {
  newPlan: SubscriptionPlan | string;
  newBillingCycle: BillingCycle | string;
}

export interface ISubscriptionHistory {
  history: ISubscription[];
}

export interface IInvoicesResponse {
  invoices: unknown[];
}

export const PLAN_LIMITS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 50,
  [SubscriptionPlan.PRO]: 1000,
  [SubscriptionPlan.ULTRA]: Infinity,
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

