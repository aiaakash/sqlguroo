/**
 * Admin types for user management
 */

export interface TAdminUser {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string;
  provider: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  termsAccepted: boolean;
  createdAt: string;
  updatedAt: string;
  subscription: {
    plan: string;
    status: string;
    billingCycle?: string;
    isImplicit?: boolean;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    error?: boolean;
  };
  usage: {
    queryCount: number;
    limit: number;
    percentage: number;
    periodStart?: string;
    periodEnd?: string;
    error?: boolean;
  };
  planLimits: {
    queryLimit: number;
    features: string[];
  };
}

export interface TAdminUserDetail extends Omit<TAdminUser, 'subscription'> {
  pluginsCount: number;
  favoritesCount: number;
  subscription: {
    current: {
      plan: string;
      status: string;
      billingCycle?: string;
      isImplicit?: boolean;
      currentPeriodStart?: string;
      currentPeriodEnd?: string;
    };
    history: Array<{
      plan: string;
      status: string;
      createdAt: string;
    }>;
  };
}

export interface TAdminUsersResponse {
  users: TAdminUser[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface TAdminUsersParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TAdminStats {
  totalUsers: number;
  newUsersLast7Days: number;
  newUsersLast30Days: number;
  activeUsers: number;
  usersByRole: Record<string, number>;
  usersByProvider: Record<string, number>;
  subscriptionStats: Record<string, number>;
  adminEmails: string[];
}

export interface TAdminCheckResponse {
  isAdmin: boolean;
  email: string;
}

