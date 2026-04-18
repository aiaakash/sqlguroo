const mongoose = require('mongoose');
const crypto = require('crypto');
const { Organization, OrganizationMembership, User } = require('~/db/models');

function generateInviteCode() {
  return crypto.randomBytes(6).toString('base64')
    .replace(/[^A-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

function generateSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

async function createOrganization({ name, description, createdBy }) {
  const slug = generateSlug(name);
  const inviteCode = generateInviteCode();

  const org = new Organization({
    name,
    slug,
    description,
    inviteCode,
    createdBy,
  });

  await org.save();
  return org;
}

async function addMemberToOrganization({ organizationId, userId, role, invitedBy }) {
  const existing = await OrganizationMembership.findOne({ organizationId, userId }).lean();
  if (existing) {
    return { ...existing, alreadyExists: true };
  }

  const membership = new OrganizationMembership({
    organizationId,
    userId,
    role,
    invitedBy,
    joinedAt: new Date(),
  });

  await membership.save();

  await User.findByIdAndUpdate(userId, { $set: { organizationId } });

  return membership;
}

async function getOrganizationById(organizationId) {
  return Organization.findById(organizationId).lean();
}

async function getOrganizationByInviteCode(code) {
  return Organization.findOne({ inviteCode: code }).lean();
}

async function getUserOrganization(userId) {
  const user = await User.findById(userId).select('organizationId').lean();
  if (!user || !user.organizationId) {
    return null;
  }
  const org = await getOrganizationById(user.organizationId);
  return org;
}

async function getUserOrgMembership(userId) {
  return OrganizationMembership.findOne({ userId }).populate('organizationId').lean();
}

async function getOrganizationMembers(organizationId) {
  return OrganizationMembership.find({ organizationId })
    .populate('userId', 'name email avatar')
    .populate('invitedBy', 'name email')
    .lean();
}

async function updateOrganization(organizationId, updates) {
  const allowedFields = ['name', 'description', 'avatar'];
  const filteredUpdates = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  }
  return Organization.findByIdAndUpdate(organizationId, { $set: filteredUpdates }, { new: true }).lean();
}

async function updateMemberRole(organizationId, userId, role) {
  return OrganizationMembership.findOneAndUpdate(
    { organizationId, userId },
    { $set: { role } },
    { new: true },
  ).lean();
}

async function removeMember(organizationId, userId) {
  const membership = await OrganizationMembership.findOne({ organizationId, userId }).lean();
  if (!membership) {
    return { success: false, message: 'Member not found' };
  }

  const adminCount = await OrganizationMembership.countDocuments({ organizationId, role: 'admin' });
  if (membership.role === 'admin' && adminCount <= 1) {
    return { success: false, message: 'Cannot remove the last admin' };
  }

  await OrganizationMembership.deleteOne({ organizationId, userId });
  await User.findByIdAndUpdate(userId, { $unset: { organizationId: 1 } });

  return { success: true };
}

async function deleteOrganization(organizationId) {
  const members = await OrganizationMembership.find({ organizationId }).lean();
  const userIds = members.map((m) => m.userId);

  await OrganizationMembership.deleteMany({ organizationId });
  await User.updateMany({ _id: { $in: userIds } }, { $unset: { organizationId: 1 } });
  await Organization.findByIdAndDelete(organizationId);
}

async function rotateInviteCode(organizationId) {
  const newCode = generateInviteCode();
  await Organization.findByIdAndUpdate(organizationId, { $set: { inviteCode: newCode } });
  return newCode;
}

async function getPendingUsers(organizationId, limit = 50, skip = 0) {
  const members = await OrganizationMembership.find({ organizationId }).select('userId').lean();
  const memberUserIds = members.map(m => m.userId);

  const pendingUsers = await User.find(
    { _id: { $nin: memberUserIds } },
    '_id name email provider role createdAt',
  )
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await User.countDocuments({ _id: { $nin: memberUserIds } });

  return {
    users: pendingUsers.map(u => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      provider: u.provider,
      role: u.role,
      createdAt: u.createdAt,
    })),
    total,
  };
}

async function ensureUserInOrg(userId) {
  const user = await User.findById(userId).select('organizationId').lean();
  if (user && user.organizationId) {
    return true;
  }

  const existingOrg = await Organization.findOne().sort({ createdAt: 1 });
  if (!existingOrg) {
    return false;
  }

  const existingMembership = await OrganizationMembership.findOne({ userId });
  if (existingMembership) {
    return true;
  }

  await addMemberToOrganization({
    organizationId: existingOrg._id,
    userId,
    role: 'member',
  });

  return true;
}

module.exports = {
  createOrganization,
  addMemberToOrganization,
  getOrganizationById,
  getOrganizationByInviteCode,
  getUserOrganization,
  getUserOrgMembership,
  getOrganizationMembers,
  updateOrganization,
  updateMemberRole,
  removeMember,
  deleteOrganization,
  rotateInviteCode,
  getPendingUsers,
  ensureUserInOrg,
};
