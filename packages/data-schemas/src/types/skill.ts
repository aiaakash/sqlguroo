import type { Document, Types } from 'mongoose';

/**
 * Skill - User-managed context library for enhancing agent understanding
 */
export interface ISkill extends Document {
  /** Unique identifier */
  _id: Types.ObjectId;
  /** Unique skill ID (UUID format) */
  skillId: string;
  /** Skill title (max 100 chars) */
  title: string;
  /** Semantic summary/description (max 500 chars) - used for relevance matching */
  description: string;
  /** Skill content - SQL query OR markdown file content */
  content: string;
  /** User who created this skill */
  userId: Types.ObjectId;
  /** Whether the skill is active (only active skills are used) */
  isActive: boolean;
  /** Embedding vector for semantic search (optional, computed on demand) */
  embedding?: number[];
  /** When embedding was last computed */
  embeddingUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to create a new skill
 */
export interface CreateSkillRequest {
  title: string;
  description: string;
  content: string;
  isActive?: boolean;
}

/**
 * Request to update a skill
 */
export interface UpdateSkillRequest {
  title?: string;
  description?: string;
  content?: string;
  isActive?: boolean;
}

/**
 * Skill with relevance score (for semantic matching results)
 */
export interface ISkillWithRelevance extends ISkill {
  /** Cosine similarity score (0-1) */
  relevanceScore: number;
}

