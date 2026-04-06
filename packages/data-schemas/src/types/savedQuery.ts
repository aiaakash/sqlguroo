import type { Document, Types } from 'mongoose';

/**
 * Saved Query - allows users to save and reuse SQL queries
 */
export interface ISavedQuery extends Document {
  /** Unique identifier */
  _id: Types.ObjectId;
  /** User who saved the query */
  userId: Types.ObjectId;
  /** Display name for the saved query */
  name: string;
  /** The SQL query content */
  sqlContent: string;
  /** Optional description */
  description?: string;
  /** Conversation ID where query was originally generated (optional) */
  conversationId?: string;
  /** Message ID where query was originally generated (optional) */
  messageId?: string;
  /** Database connection ID (optional, for context) */
  connectionId?: string;
  /** Tags for organization */
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Request to create a new saved query
 */
export interface CreateSavedQueryRequest {
  name: string;
  sqlContent: string;
  description?: string;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  tags?: string[];
}

/**
 * Request to update a saved query
 */
export interface UpdateSavedQueryRequest {
  name?: string;
  sqlContent?: string;
  description?: string;
  tags?: string[];
}

/**
 * Saved query response (without internal fields)
 */
export interface SavedQueryResponse {
  _id: string;
  userId: string;
  name: string;
  sqlContent: string;
  description?: string;
  conversationId?: string;
  messageId?: string;
  connectionId?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * List saved queries request parameters
 */
export interface ListSavedQueriesParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDirection?: 'asc' | 'desc';
}

/**
 * List saved queries response
 */
export interface ListSavedQueriesResponse {
  queries: SavedQueryResponse[];
  total: number;
  page: number;
  totalPages: number;
  hasMore: boolean;
}
