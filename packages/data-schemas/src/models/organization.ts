import organizationSchema from '~/schema/organization';
import type * as t from '~/types';

export function createOrganizationModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Organization || mongoose.model<t.IOrganization>('Organization', organizationSchema);
}
