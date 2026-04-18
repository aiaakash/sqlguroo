import { Schema } from 'mongoose';
import type { IOrganization } from '~/types';

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [100, 'Organization name cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Organization slug is required'],
      trim: true,
      lowercase: true,
      maxlength: [100, 'Organization slug cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    avatar: {
      type: String,
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: [16, 'Invite code cannot exceed 16 characters'],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

organizationSchema.index({ slug: 1 }, { unique: true });

export default organizationSchema;
