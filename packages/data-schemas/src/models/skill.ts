import skillSchema from '~/schema/skill';
import type { ISkill } from '~/types';

/**
 * Creates or returns the Skill model using the provided mongoose instance and schema
 */
export function createSkillModel(mongoose: typeof import('mongoose')) {
  return mongoose.models.Skill || mongoose.model<ISkill>('Skill', skillSchema);
}

