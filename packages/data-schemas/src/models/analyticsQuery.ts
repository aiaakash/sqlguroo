import analyticsQuerySchema from '~/schema/analyticsQuery';
import type { IAnalyticsQuery } from '~/types';

/**
 * Creates or returns the AnalyticsQuery model using the provided mongoose instance and schema
 */
export function createAnalyticsQueryModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.AnalyticsQuery ||
    mongoose.model<IAnalyticsQuery>('AnalyticsQuery', analyticsQuerySchema)
  );
}

