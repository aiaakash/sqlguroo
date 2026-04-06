import dashboardSchema from '~/schema/dashboard';
import type { IDashboard } from '~/types/dashboard';

/**
 * Creates or returns the Dashboard model using the provided mongoose instance and schema
 */
export function createDashboardModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Dashboard || mongoose.model<IDashboard>('Dashboard', dashboardSchema);
}

