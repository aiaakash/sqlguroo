import usageSchema from '../schema/usage';
import type { IUsage } from '~/types';

export function createUsageModel(mongoose: typeof import('mongoose')) {
  const Model = mongoose.models.Usage || mongoose.model<IUsage>('Usage', usageSchema);
  return Model;
}

