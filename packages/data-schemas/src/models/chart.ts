import chartSchema from '~/schema/chart';
import type { IChart } from '~/types/chart';

/**
 * Creates or returns the Chart model using the provided mongoose instance and schema
 */
export function createChartModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Chart || mongoose.model<IChart>('Chart', chartSchema);
}

