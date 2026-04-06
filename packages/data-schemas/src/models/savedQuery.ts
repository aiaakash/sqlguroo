import savedQuerySchema from '~/schema/savedQuery';
import type { ISavedQuery } from '~/types';

/**
 * Creates or returns the SavedQuery model using the provided mongoose instance and schema
 */
export function createSavedQueryModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.SavedQuery || mongoose.model<ISavedQuery>('SavedQuery', savedQuerySchema)
  );
}
