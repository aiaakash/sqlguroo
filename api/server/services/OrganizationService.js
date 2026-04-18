const mongoose = require('mongoose');
const { Organization, OrganizationMembership, User } = require('~/db/models');

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function generateSlug(name) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = Date.now().toString(36);
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
  return Organization.findByIdAndUpdate(organizationId, { $set: updates }, { new: true }).lean();
}

async function updateMemberRole(organizationId, userId, role) {
  return OrganizationMembership.findOneAndUpdate(
    { organizationId, userId },
    { $set: { role } },
    { new: true },
  ).lean();
}

async function removeMember(organizationId, userId) {
  await OrganizationMembership.deleteOne({ organizationId, userId });
  await User.findByIdAndUpdate(userId, { $unset: { organizationId: 1 } });
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
};
