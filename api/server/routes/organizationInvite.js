const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
  getUserOrganization,
  getOrganizationByInviteCode,
  addMemberToOrganization,
  rotateInviteCode,
  updateOrganization,
} = require('~/server/services/OrganizationService');
const { requireOrgMember, requireOrgAdmin } = require('~/server/middleware/org');
const { requireJwtAuth } = require('~/server/middleware');
const { findUser, updateUser } = require('~/models');
const { sendEmail } = require('~/server/utils');

const domains = {
  client: process.env.DOMAIN_CLIENT,
};

router.post('/me/invite/code', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const newCode = await rotateInviteCode(orgId);
    res.json({ inviteCode: newCode });
  } catch (error) {
    res.status(500).json({ message: 'Error generating invite code' });
  }
});

router.post('/me/invite/email', requireJwtAuth, requireOrgAdmin, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const org = await getUserOrganization(req.user._id);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    const inviteToken = jwt.sign(
      { email, organizationId: orgId },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' },
    );

    const inviteLink = `${domains.client}/join-org?token=${inviteToken}`;

    await sendEmail({
      email,
      subject: `You're invited to join ${org.name} on ${process.env.APP_TITLE || 'SQLGuroo'}`,
      payload: {
        appName: process.env.APP_TITLE || 'SQLGuroo',
        orgName: org.name,
        inviteLink,
        year: new Date().getFullYear(),
      },
      template: 'inviteEmail.handlebars',
    });

    res.json({ message: 'Invite email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error sending invite email' });
  }
});

router.post('/join/:code', requireJwtAuth, async (req, res) => {
  try {
    const { code } = req.params;
    const userId = req.user._id;

    const user = await findUser({ _id: userId }, 'organizationId');
    if (user && user.organizationId) {
      return res.status(400).json({ message: 'You are already a member of an organization' });
    }

    const org = await getOrganizationByInviteCode(code);
    if (!org) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    await addMemberToOrganization({
      organizationId: org._id,
      userId,
      role: 'member',
      invitedBy: req.user._id,
    });

    res.json({ message: 'Successfully joined organization', organizationId: org._id });
  } catch (error) {
    res.status(500).json({ message: 'Error joining organization' });
  }
});

router.post('/join', requireJwtAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Invite token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    } catch {
      return res.status(400).json({ message: 'Invalid or expired invite token' });
    }

    const userId = req.user._id;
    const user = await findUser({ _id: userId }, 'organizationId email');

    if (user && user.organizationId) {
      return res.status(400).json({ message: 'You are already a member of an organization' });
    }

    if (decoded.email && user && user.email !== decoded.email) {
      return res.status(400).json({ message: 'Invite email does not match your account' });
    }

    await addMemberToOrganization({
      organizationId: decoded.organizationId,
      userId,
      role: 'member',
      invitedBy: req.user._id,
    });

    res.json({ message: 'Successfully joined organization', organizationId: decoded.organizationId });
  } catch (error) {
    res.status(500).json({ message: 'Error joining organization' });
  }
});

router.get('/me/invite', requireJwtAuth, requireOrgMember, async (req, res) => {
  try {
    const org = await getUserOrganization(req.user._id);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    res.json({ inviteCode: org.inviteCode });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching invite code' });
  }
});

module.exports = router;
