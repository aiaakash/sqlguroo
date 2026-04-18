const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {
  getUserOrganization,
  getOrganizationByInviteCode,
  addMemberToOrganization,
  rotateInviteCode,
} = require('~/server/services/OrganizationService');
const { requireOrgMember, requireOrgAdmin } = require('~/server/middleware/org');
const { requireJwtAuth } = require('~/server/middleware');
const { findUser } = require('~/models');
const { sendEmail } = require('~/server/utils');
const orgInviteLimiter = require('~/server/middleware/limiters/orgInviteLimiter');
const orgJoinLimiter = require('~/server/middleware/limiters/orgJoinLimiter');

const domains = {
  client: process.env.DOMAIN_CLIENT,
};

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[OrgInvite] WARNING: JWT_SECRET is not set. Invite tokens will be insecure.');
}

router.post('/me/invite/code', requireJwtAuth, requireOrgAdmin, orgInviteLimiter, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const newCode = await rotateInviteCode(orgId);
    res.json({ inviteCode: newCode });
  } catch (error) {
    res.status(500).json({ message: 'Error generating invite code' });
  }
});

router.post('/me/invite/email', requireJwtAuth, requireOrgAdmin, orgInviteLimiter, async (req, res) => {
  try {
    const orgId = req.userOrganizationId;
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    const org = await getUserOrganization(req.user._id);
    if (!org) {
      return res.status(404).json({ message: 'Organization not found' });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server configuration error' });
    }

    const inviteToken = jwt.sign(
      { email, organizationId: orgId },
      JWT_SECRET,
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

router.post('/join/:code', requireJwtAuth, orgJoinLimiter, async (req, res) => {
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
    });

    res.json({ message: 'Successfully joined organization', organizationId: org._id });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You are already a member of this organization' });
    }
    res.status(500).json({ message: 'Error joining organization' });
  }
});

router.post('/join', requireJwtAuth, orgJoinLimiter, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Invite token is required' });
    }

    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server configuration error' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ message: 'Invalid or expired invite token' });
    }

    if (!decoded.email || !decoded.organizationId) {
      return res.status(400).json({ message: 'Invalid invite token payload' });
    }

    const userId = req.user._id;
    const user = await findUser({ _id: userId }, 'organizationId email');

    if (user && user.organizationId) {
      return res.status(400).json({ message: 'You are already a member of an organization' });
    }

    if (user.email !== decoded.email) {
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
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You are already a member of this organization' });
    }
    res.status(500).json({ message: 'Error joining organization' });
  }
});

router.get('/me/invite', requireJwtAuth, requireOrgAdmin, async (req, res) => {
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
