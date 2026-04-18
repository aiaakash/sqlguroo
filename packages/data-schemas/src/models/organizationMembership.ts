import organizationMembershipSchema from '~/schema/organizationMembership';
import type * as t from '~/types';

export function createOrganizationMembershipModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.OrganizationMembership || mongoose.model<t.IOrganizationMembership>('OrganizationMembership', organizationMembershipSchema);
}
