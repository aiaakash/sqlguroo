const express = require('express');
const router = express.Router();
const {
  getUserOrganization,
  getOrganizationMembers,
  updateOrganization,
  updateMemberRole,
  removeMember,
  deleteOrganization,
  addMemberToOrganization,
} = require('~/server/services/OrganizationService');
const { requireOrgMember, requireOrgAdmin } = require('~/server/middleware/org');
const { requireJwtAuth } = require('~/server/middleware');
const { User } = require('~/db/models');

router.get('/me', requireJwtAuth, requireOrgMember, async (req, res) => {
  try {
    const org = req.userMembership.organizationId;
    res.json({
      id: org._id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      avatar: org.avatar,
      inviteCode: org.inviteCode,
      createdBy: org.createdBy,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching organization' });
  }
});

router.patch('/me', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const { name, description, avatar } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (avatar !== undefined) updates.avatar = avatar;

    const updatedOrg = await updateOrganization(orgId, updates);
    res.json(updatedOrg);
  } catch (error) {
    res.status(500).json({ message: 'Error updating organization' });
  }
});

router.delete('/me', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    await deleteOrganization(orgId);
    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting organization' });
  }
});

router.get('/me/members', requireJwtAuth, requireOrgMember, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const members = await getOrganizationMembers(orgId);

    const formatted = members.map((m) => ({
      id: m._id,
      userId: m.userId._id,
      user: {
        id: m.userId._id,
        name: m.userId.name,
        email: m.userId.email,
        avatar: m.userId.avatar,
      },
      role: m.role,
      invitedBy: m.invitedBy?._id,
      joinedAt: m.joinedAt,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching members' });
  }
});

router.patch('/me/members/:userId', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'member'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const membership = await updateMemberRole(orgId, userId, role);
    if (!membership) {
      return res.status(404).json({ message: 'Member not found' });
    }

    res.json(membership);
  } catch (error) {
    res.status(500).json({ message: 'Error updating member role' });
  }
});

router.delete('/me/members/:userId', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const { userId } = req.params;

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot remove yourself' });
    }

    await removeMember(orgId, userId);
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error removing member' });
  }
});

router.get('/me/pending', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const members = await getOrganizationMembers(orgId);
    const memberUserIds = new Set(members.map(m => m.userId._id.toString()));

    const pendingUsers = await User.find(
      { _id: { $nin: [...memberUserIds] } },
      '_id name email provider role createdAt',
    ).sort({ createdAt: -1 }).lean();

    const formatted = pendingUsers.map(u => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      provider: u.provider,
      role: u.role,
      createdAt: u.createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending users' });
  }
});

router.post('/me/members/add', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.organizationId) {
      return res.status(400).json({ message: 'User is already a member of an organization' });
    }

    await addMemberToOrganization({
      organizationId: orgId,
      userId,
      role: role || 'member',
    });

    res.json({ message: 'User added to organization successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error adding user to organization' });
  }
});

module.exports = router;
