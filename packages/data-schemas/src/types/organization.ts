import type { Document, Types } from 'mongoose';

export interface IOrganization extends Document {
  name: string;
  slug: string;
  description?: string;
  avatar?: string;
  inviteCode: string;
  createdBy: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IOrganizationMembership extends Document {
  organizationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'admin' | 'member';
  invitedBy?: Types.ObjectId;
  joinedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type TOrgRole = 'admin' | 'member';

export interface TOrganization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatar?: string;
  inviteCode: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TOrganizationMember {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  role: TOrgRole;
  invitedBy?: string;
  joinedAt: string;
}

export interface TCreateOrganization {
  name: string;
  description?: string;
}

export interface TUpdateOrganization {
  name?: string;
  description?: string;
  avatar?: string;
}

export interface TOrgInviteRequest {
  email: string;
}

export interface TOrgJoinRequest {
  code?: string;
  token?: string;
}
