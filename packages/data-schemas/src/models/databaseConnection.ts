import databaseConnectionSchema from '~/schema/databaseConnection';
import type { IDatabaseConnection } from '~/types';

/**
 * Creates or returns the DatabaseConnection model using the provided mongoose instance and schema
 */
export function createDatabaseConnectionModel(mongoose: typeof import('mongoose')) {
  return (
    mongoose.models.DatabaseConnection ||
    mongoose.model<IDatabaseConnection>('DatabaseConnection', databaseConnectionSchema)
  );
}

