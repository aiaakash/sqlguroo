import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import {
  useGetAdminUsersQuery,
  useGetAdminStatsQuery,
  useCheckAdminAccessQuery,
  PLAN_NAMES,
  SubscriptionPlan,
  request,
} from 'librechat-data-provider';
import type { TAdminUser, TAdminUsersParams } from 'librechat-data-provider';
import {
  Loader,
  ArrowLeft,
  Users,
  TrendingUp,
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  Mail,
  Calendar,
  CreditCard,
  BarChart3,
  RefreshCw,
  MoreHorizontal,
  Crown,
  Zap,
  UserCheck,
  Settings,
  DollarSign,
  PieChart,
  Building2,
  Copy,
  UserPlus,
} from 'lucide-react';
import { Button, Input, Spinner } from '@librechat/client';
import { cn } from '~/utils';
import { useLocalize } from '~/hooks';

// Tab configuration
enum AdminTabValues {
  USERS = 'users',
  ORGANIZATION = 'organization',
  ANALYTICS = 'analytics',
  BILLING = 'billing',
  PLANS = 'plans',
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
}

const StatCard = ({ title, value, icon: Icon, colorClass }: StatCardProps) => (
  <div className="rounded-xl border border-border-light bg-surface-tertiary p-4 dark:border-border-dark dark:bg-surface-tertiary">
    <div className="flex items-center gap-3">
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', colorClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-text-secondary">{title}</p>
        <p className="text-xl font-semibold text-text-primary">{value}</p>
      </div>
    </div>
  </div>
);

const QuickAction = ({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick?: () => void }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
  >
    <Icon className="h-4 w-4" />
    <span>{label}</span>
  </button>
);

export default function AdminPage() {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = useState(AdminTabValues.USERS);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Org state
  interface TOrg { id: string; name: string; slug: string; description?: string; avatar?: string; inviteCode: string; createdBy: string; createdAt: string; updatedAt: string; }
  interface TOrgMember { id: string; userId: string; user: { id: string; name: string; email: string; avatar?: string; }; role: 'admin' | 'member'; invitedBy?: string; joinedAt: string; }
  interface TPendingUser { id: string; name: string; email: string; provider: string; role: string; createdAt: string; }
  const [organization, setOrganization] = useState<TOrg | null>(null);
  const [members, setMembers] = useState<TOrgMember[]>([]);
  const [pendingUsers, setPendingUsers] = useState<TPendingUser[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgDescription, setOrgDescription] = useState('');
  const [orgLoading, setOrgLoading] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSendingInvite, setOrgSendingInvite] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [orgSuccess, setOrgSuccess] = useState('');
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);

  // Check if current user has admin access
  const { data: adminAccess, isLoading: checkingAccess, error: accessError } = useCheckAdminAccessQuery();

  const params: TAdminUsersParams = useMemo(() => ({
    page,
    pageSize,
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
  }), [page, pageSize, search, sortBy, sortOrder]);

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers } = useGetAdminUsersQuery(params, {
    enabled: !!adminAccess?.isAdmin,
  });
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useGetAdminStatsQuery({
    enabled: !!adminAccess?.isAdmin,
  });

  // Org data fetching
  useEffect(() => {
    if (activeTab === AdminTabValues.ORGANIZATION && adminAccess?.isAdmin) {
      fetchOrgData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, adminAccess?.isAdmin]);

  const fetchOrgData = async () => {
    setOrgLoading(true);
    setOrgError('');
    try {
      const [orgData, membersData, pendingData] = await Promise.all([
        request.get('/api/organizations/me'),
        request.get('/api/organizations/me/members'),
        request.get('/api/organizations/me/pending?limit=50'),
      ]);
      setOrganization(orgData);
      setOrgName(orgData.name);
      setOrgDescription(orgData.description || '');
      setMembers(membersData);
      setPendingUsers(pendingData.users || []);
      const user = await request.get('/api/user');
      const myMembership = membersData.find((m: TOrgMember) => m.userId === user.id);
      setIsOrgAdmin(myMembership?.role === 'admin');
    } catch {
      setOrgError('Failed to load organization data');
    } finally {
      setOrgLoading(false);
    }
  };

  const handleSaveOrg = async () => {
    setOrgSaving(true);
    setOrgError('');
    setOrgSuccess('');
    try {
      const data = await request.patch('/api/organizations/me', { name: orgName, description: orgDescription });
      setOrganization(data);
      setOrgSuccess('Organization updated successfully');
    } catch (err: any) {
      setOrgError(err?.response?.data?.message || 'Failed to update organization');
    } finally {
      setOrgSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail) return;
    setOrgSendingInvite(true);
    setOrgError('');
    setOrgSuccess('');
    try {
      await request.post('/api/organizations/me/invite/email', { email: inviteEmail });
      setOrgSuccess('Invite email sent successfully');
      setInviteEmail('');
    } catch (err: any) {
      setOrgError(err?.response?.data?.message || 'Failed to send invite');
    } finally {
      setOrgSendingInvite(false);
    }
  };

  const handleRegenerateCode = async () => {
    try {
      const data = await request.post('/api/organizations/me/invite/code', {});
      setInviteCode(data.inviteCode);
      setOrgSuccess('New invite code generated');
    } catch {
      setOrgError('Failed to generate invite code');
    }
  };

  const handleShowCode = async () => {
    try {
      const data = await request.get('/api/organizations/me/invite');
      setInviteCode(data.inviteCode);
    } catch {
      setOrgError('Failed to fetch invite code');
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setOrgSuccess('Invite code copied to clipboard');
  };

  const handleChangeRole = async (userId: string, newRole: 'admin' | 'member') => {
    try {
      await request.patch(`/api/organizations/me/members/${userId}`, { role: newRole });
      setMembers(members.map(m => m.userId === userId ? { ...m, role: newRole } : m));
    } catch {
      setOrgError('Failed to update member role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await request.delete(`/api/organizations/me/members/${userId}`);
      setMembers(members.filter(m => m.userId !== userId));
    } catch {
      setOrgError('Failed to remove member');
    }
  };

  const handleAddToOrg = async (userId: string) => {
    try {
      await request.post('/api/organizations/me/members/add', { userId, role: 'member' });
      setPendingUsers(pendingUsers.filter(u => u.id !== userId));
      fetchOrgData();
    } catch {
      setOrgError('Failed to add user to organization');
    }
  };

  // Loading state while checking access
  if (checkingAccess) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-primary">
        <Loader className="h-8 w-8 animate-spin text-text-secondary" />
      </div>
    );
  }

  // Access denied
  if (accessError || !adminAccess?.isAdmin) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-surface-primary p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <Shield className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Access Denied</h1>
          <p className="max-w-md text-text-secondary">
            You don't have permission to access this page. Only administrators can view user management.
          </p>
          <Link to="/">
            <Button className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Chat
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const users = usersData?.users || [];
  const pagination = usersData?.pagination;
  const stats = statsData;

  const handleRefresh = () => {
    refetchUsers();
    refetchStats();
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const getPlanBadge = (plan: string) => {
    const configs: Record<string, { class: string; label: string }> = {
      [SubscriptionPlan.ULTRA]: { 
        class: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', 
        label: 'Ultra' 
      },
      [SubscriptionPlan.PRO]: { 
        class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', 
        label: 'Pro' 
      },
      [SubscriptionPlan.FREE]: { 
        class: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', 
        label: 'Free' 
      },
    };
    
    const config = configs[plan] || configs[SubscriptionPlan.FREE];
    
    return (
      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', config.class)}>
        {config.label}
      </span>
    );
  };

  const getUsageBar = (percentage: number) => {
    let colorClass = 'bg-green-500';
    if (percentage >= 80) colorClass = 'bg-red-500';
    else if (percentage >= 60) colorClass = 'bg-yellow-500';
    
    return (
      <div className="flex items-center gap-2">
        <div className="relative h-1.5 w-16 overflow-hidden rounded-full bg-surface-hover">
          <div
            className={cn('h-full rounded-full transition-all', colorClass)}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <span className="text-xs text-text-secondary">{Math.round(percentage)}%</span>
      </div>
    );
  };

  const adminTabs = [
    { value: AdminTabValues.USERS, icon: Users, label: 'Users' },
    { value: AdminTabValues.ORGANIZATION, icon: Building2, label: 'Organization' },
    { value: AdminTabValues.ANALYTICS, icon: BarChart3, label: 'Analytics' },
    { value: AdminTabValues.BILLING, icon: DollarSign, label: 'Billing' },
    { value: AdminTabValues.PLANS, icon: Crown, label: 'Plans' },
  ];

  const handleTabChange = (value: string) => {
    setActiveTab(value as AdminTabValues);
  };

  return (
    <div className="flex h-full w-full bg-surface-primary">
      <Tabs.Root
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex w-full flex-col gap-6 md:flex-row"
        orientation="vertical"
      >
        {/* Sidebar / Tabs */}
        <div className="w-full border-b border-border-light bg-surface-secondary px-4 py-4 dark:border-border-dark dark:bg-surface-secondary md:w-64 md:border-b-0 md:border-r">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">Admin</h1>
              <p className="text-xs text-text-secondary">System Management</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <Tabs.List
            className="flex flex-row gap-1 overflow-x-auto md:flex-col"
            aria-label="Admin Navigation"
          >
            {adminTabs.map(({ value, icon: Icon, label }) => (
              <Tabs.Trigger
                key={value}
                value={value}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                  'text-text-secondary radix-state-active:bg-surface-tertiary radix-state-active:text-text-primary',
                  'hover:bg-surface-hover hover:text-text-primary'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          {/* Quick Actions */}
          <div className="mt-6 border-t border-border-light pt-4 dark:border-border-dark">
            <p className="mb-2 px-3 text-xs font-medium text-text-secondary">Quick Actions</p>
            <QuickAction icon={UserCheck} label="Manage Users" />
            <QuickAction icon={CreditCard} label="View Billing" />
          </div>

          {/* Back Link */}
          <div className="mt-auto border-t border-border-light pt-4 dark:border-border-dark">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Chat
            </Link>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Users Tab */}
          <Tabs.Content value={AdminTabValues.USERS} className="w-full" tabIndex={-1}>
            <div className="mx-auto max-w-6xl space-y-6">
              {/* Header with refresh */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Users</h2>
                  <p className="text-sm text-text-secondary">Manage system users and view statistics</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={usersLoading || statsLoading}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', (usersLoading || statsLoading) && 'animate-spin')} />
                  Refresh
                </Button>
              </div>

              {/* Stats Grid */}
              {statsLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-tertiary" />
                  ))}
                </div>
              ) : stats && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="Total Users"
                    value={stats.totalUsers.toLocaleString()}
                    icon={Users}
                    colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  />
                  <StatCard
                    title="New This Week"
                    value={stats.newUsersLast7Days.toLocaleString()}
                    icon={TrendingUp}
                    colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  />
                  <StatCard
                    title="New This Month"
                    value={stats.newUsersLast30Days.toLocaleString()}
                    icon={Calendar}
                    colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                  />
                  <StatCard
                    title="Active Users"
                    value={stats.activeUsers.toLocaleString()}
                    icon={Activity}
                    colorClass="bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                  />
                </div>
              )}

              {/* Users Table */}
              <div className="rounded-xl border border-border-light bg-surface-secondary shadow-sm dark:border-border-dark dark:bg-surface-secondary">
                {/* Table Header with Search */}
                <div className="flex flex-col gap-4 border-b border-border-light p-4 dark:border-border-dark sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-text-secondary" />
                    <span className="font-medium text-text-primary">
                      All Users
                      {pagination && (
                        <span className="ml-2 text-sm text-text-secondary">
                          ({pagination.total.toLocaleString()})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                    <Input
                      type="text"
                      placeholder="Search users..."
                      value={search}
                      onChange={handleSearch}
                      className="w-full pl-9 sm:w-64"
                    />
                  </div>
                </div>

                {/* Table Content */}
                {usersLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader className="h-6 w-6 animate-spin text-text-secondary" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="h-12 w-12 text-text-tertiary" />
                    <p className="mt-2 text-text-secondary">No users found</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border-light bg-surface-tertiary dark:border-border-dark dark:bg-surface-tertiary">
                            <th
                              className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary"
                              onClick={() => handleSort('email')}
                            >
                              User {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                              className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary"
                              onClick={() => handleSort('role')}
                            >
                              Role {sortBy === 'role' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                              Plan
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                              Usage
                            </th>
                            <th
                              className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary"
                              onClick={() => handleSort('createdAt')}
                            >
                              Joined {sortBy === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-light dark:divide-border-dark">
                          {users.map((user: TAdminUser) => (
                            <tr
                              key={user.id}
                              className="transition-colors hover:bg-surface-hover"
                            >
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="font-medium text-text-primary">{user.email}</span>
                                  {(user.name || user.username) && (
                                    <span className="text-xs text-text-secondary">
                                      {user.name || user.username}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={cn(
                                    'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                                    user.role === 'ADMIN'
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                  )}
                                >
                                  {user.role || 'USER'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {getPlanBadge(user.subscription.plan)}
                              </td>
                              <td className="px-4 py-3">
                                {getUsageBar(user.usage.percentage)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-sm text-text-secondary">
                                  {new Date(user.createdAt).toLocaleDateString()}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  {user.emailVerified && (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30" title="Email verified">
                                      <Mail className="h-3 w-3 text-green-600 dark:text-green-400" />
                                    </span>
                                  )}
                                  {user.twoFactorEnabled && (
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30" title="2FA enabled">
                                      <Shield className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pagination && pagination.totalPages > 1 && (
                      <div className="flex items-center justify-between border-t border-border-light px-4 py-3 dark:border-border-dark">
                        <p className="text-sm text-text-secondary">
                          Showing {(pagination.page - 1) * pagination.pageSize + 1} -{' '}
                          {Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page - 1)}
                            disabled={page === 1}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm text-text-secondary">
                            Page {pagination.page} of {pagination.totalPages}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(page + 1)}
                            disabled={page >= pagination.totalPages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Subscription Stats */}
              {stats && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Plan Distribution */}
                  <div className="rounded-xl border border-border-light bg-surface-secondary p-4 dark:border-border-dark dark:bg-surface-secondary">
                    <div className="mb-4 flex items-center gap-2">
                      <PieChart className="h-5 w-5 text-text-secondary" />
                      <h3 className="font-medium text-text-primary">Plan Distribution</h3>
                    </div>
                    <div className="space-y-3">
                      {Object.entries(stats.subscriptionStats).length === 0 ? (
                        <p className="text-sm text-text-secondary">No active paid subscriptions</p>
                      ) : (
                        Object.entries(stats.subscriptionStats).map(([plan, count]) => (
                          <div key={plan} className="flex items-center justify-between">
                            <span className="text-sm text-text-primary">
                              {PLAN_NAMES[plan as keyof typeof PLAN_NAMES] || plan}
                            </span>
                            <span className="rounded-full bg-surface-tertiary px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
                              {count}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Admin List */}
                  <div className="rounded-xl border border-border-light bg-surface-secondary p-4 dark:border-border-dark dark:bg-surface-secondary">
                    <div className="mb-4 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-text-secondary" />
                      <h3 className="font-medium text-text-primary">Administrators</h3>
                    </div>
                    <div className="space-y-2">
                      {stats.adminEmails.slice(0, 5).map((email) => (
                        <div key={email} className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-text-secondary" />
                          <span className="text-text-primary">{email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Tabs.Content>

          {/* Organization Tab */}
          <Tabs.Content value={AdminTabValues.ORGANIZATION} className="w-full" tabIndex={-1}>
            <div className="mx-auto max-w-6xl space-y-4">
              {/* Header with refresh */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary">Organization</h2>
                  <p className="text-sm text-text-secondary">Manage your organization, members, and invites</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchOrgData}
                  disabled={orgLoading}
                >
                  <RefreshCw className={cn('mr-2 h-4 w-4', orgLoading && 'animate-spin')} />
                  Refresh
                </Button>
              </div>

              {/* Alerts */}
              {orgError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                  {orgError}
                </div>
              )}
              {orgSuccess && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:border-green-900 dark:bg-green-900/20 dark:text-green-400">
                  {orgSuccess}
                </div>
              )}

              {orgLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-6 w-6 animate-spin text-text-secondary" />
                </div>
              ) : !organization ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-light py-12 text-center">
                  <Building2 className="mb-2 h-10 w-10 text-text-tertiary" />
                  <p className="text-text-secondary">No organization found</p>
                  <p className="mt-1 text-sm text-text-tertiary">The first registered user should have created an organization.</p>
                </div>
              ) : (
                <>
                  {/* Organization Profile & Invite - side by side */}
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Organization Profile */}
                    <div className="rounded-xl border border-border-light bg-surface-secondary shadow-sm dark:border-border-dark dark:bg-surface-secondary">
                      <div className="border-b border-border-light px-4 py-2.5 dark:border-border-dark">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-text-secondary" />
                          <h3 className="text-sm font-medium text-text-primary">Organization Profile</h3>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Name</label>
                            <Input
                              type="text"
                              value={orgName}
                              onChange={e => setOrgName(e.target.value)}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Description</label>
                            <textarea
                              value={orgDescription}
                              onChange={e => setOrgDescription(e.target.value)}
                              rows={2}
                              className="w-full rounded-lg border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none dark:border-border-dark"
                            />
                          </div>
                          <Button size="sm" onClick={handleSaveOrg} disabled={orgSaving}>
                            {orgSaving ? <Spinner /> : 'Save Changes'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Invite Section */}
                    <div className="rounded-xl border border-border-light bg-surface-secondary shadow-sm dark:border-border-dark dark:bg-surface-secondary">
                      <div className="border-b border-border-light px-4 py-2.5 dark:border-border-dark">
                        <div className="flex items-center gap-2">
                          <UserPlus className="h-4 w-4 text-text-secondary" />
                          <h3 className="text-sm font-medium text-text-primary">Invite Members</h3>
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <Input
                              type="email"
                              placeholder="Email address"
                              value={inviteEmail}
                              onChange={e => setInviteEmail(e.target.value)}
                              className="flex-1"
                            />
                            <Button size="sm" onClick={handleSendInvite} disabled={orgSendingInvite || !isOrgAdmin}>
                              {orgSendingInvite ? <Spinner /> : (
                                <>
                                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                                  Invite
                                </>
                              )}
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              value={inviteCode}
                              readOnly
                              placeholder="Click Show to generate"
                              className="flex-1 font-mono text-xs"
                            />
                            <Button onClick={handleShowCode} variant="outline" size="sm">Show</Button>
                            {inviteCode && (
                              <>
                                <Button onClick={handleCopyCode} variant="outline" size="icon" title="Copy" className="h-8 w-8">
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                {isOrgAdmin && (
                                  <Button onClick={handleRegenerateCode} variant="outline" size="icon" title="Regenerate" className="h-8 w-8">
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Members List */}
                  <div className="rounded-xl border border-border-light bg-surface-secondary shadow-sm dark:border-border-dark dark:bg-surface-secondary">
                    <div className="border-b border-border-light px-4 py-2.5 dark:border-border-dark">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-text-secondary" />
                        <span className="text-sm font-medium text-text-primary">
                          Members
                          <span className="ml-1.5 text-xs text-text-secondary">({members.length})</span>
                        </span>
                      </div>
                    </div>
                    {members.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="h-8 w-8 text-text-tertiary" />
                        <p className="mt-1 text-sm text-text-secondary">No members found</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border-light bg-surface-tertiary dark:border-border-dark dark:bg-surface-tertiary">
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">User</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Role</th>
                              {isOrgAdmin && <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Actions</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-light dark:divide-border-dark">
                            {members.map(member => (
                              <tr key={member.userId} className="transition-colors hover:bg-surface-hover">
                                <td className="px-3 py-2">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text-primary">{member.user.name}</span>
                                    <span className="text-xs text-text-secondary">{member.user.email}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  {isOrgAdmin ? (
                                    <select
                                      value={member.role}
                                      onChange={e => handleChangeRole(member.userId, e.target.value as 'admin' | 'member')}
                                      className="rounded border border-border-light bg-surface-primary px-2 py-1 text-xs dark:border-border-dark"
                                    >
                                      <option value="admin">Admin</option>
                                      <option value="member">Member</option>
                                    </select>
                                  ) : (
                                    <span
                                      className={cn(
                                        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                                        member.role === 'admin'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                                      )}
                                    >
                                      {member.role === 'admin' ? 'Admin' : 'Member'}
                                    </span>
                                  )}
                                </td>
                                {isOrgAdmin && (
                                  <td className="px-3 py-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleRemoveMember(member.userId)}
                                      className="h-7 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                      Remove
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Pending Users */}
                  {pendingUsers.length > 0 && (
                    <div className="rounded-xl border border-border-light bg-surface-secondary shadow-sm dark:border-border-dark dark:bg-surface-secondary">
                      <div className="border-b border-border-light px-4 py-2.5 dark:border-border-dark">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-text-secondary" />
                          <div>
                            <h3 className="text-sm font-medium text-text-primary">
                              Pending Users
                              <span className="ml-1.5 text-xs text-text-secondary">({pendingUsers.length})</span>
                            </h3>
                            <p className="text-xs text-text-tertiary">Users not yet in the organization</p>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border-light bg-surface-tertiary dark:border-border-dark dark:bg-surface-tertiary">
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">User</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Provider</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Joined</th>
                              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-light dark:divide-border-dark">
                            {pendingUsers.map(user => (
                              <tr key={user.id} className="transition-colors hover:bg-surface-hover">
                                <td className="px-3 py-2">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium text-text-primary">{user.name}</span>
                                    <span className="text-xs text-text-secondary">{user.email}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="rounded-full bg-surface-tertiary px-2 py-0.5 text-xs capitalize text-text-secondary">
                                    {user.provider}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className="text-xs text-text-secondary">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddToOrg(user.id)}
                                    className="h-7 text-xs text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                                  >
                                    <UserPlus className="mr-1 h-3 w-3" />
                                    Add
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Tabs.Content>

          {/* Analytics Tab */}
          <Tabs.Content value={AdminTabValues.ANALYTICS} className="w-full" tabIndex={-1}>
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BarChart3 className="h-16 w-16 text-text-tertiary" />
                <h2 className="mt-4 text-xl font-semibold text-text-primary">Analytics</h2>
                <p className="mt-2 text-text-secondary">Detailed analytics coming soon</p>
              </div>
            </div>
          </Tabs.Content>

          {/* Billing Tab */}
          <Tabs.Content value={AdminTabValues.BILLING} className="w-full" tabIndex={-1}>
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <DollarSign className="h-16 w-16 text-text-tertiary" />
                <h2 className="mt-4 text-xl font-semibold text-text-primary">Billing</h2>
                <p className="mt-2 text-text-secondary">Billing management coming soon</p>
              </div>
            </div>
          </Tabs.Content>

          {/* Plans Tab */}
          <Tabs.Content value={AdminTabValues.PLANS} className="w-full" tabIndex={-1}>
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Crown className="h-16 w-16 text-text-tertiary" />
                <h2 className="mt-4 text-xl font-semibold text-text-primary">Plans</h2>
                <p className="mt-2 text-text-secondary">Plan management coming soon</p>
              </div>
            </div>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
