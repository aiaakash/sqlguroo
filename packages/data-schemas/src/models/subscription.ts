import subscriptionSchema from '../schema/subscription';
import type { ISubscription } from '~/types';

export function createSubscriptionModel(mongoose: typeof import('mongoose')) {
  const Model = mongoose.models.Subscription || mongoose.model<ISubscription>('Subscription', subscriptionSchema);
  return Model;
}

