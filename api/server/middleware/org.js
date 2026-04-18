const { getUserOrgMembership } = require('~/server/services/OrganizationService');

async function requireOrgMember(req, res, next) {
  try {
    const userId = req.user._id;
    const membership = await getUserOrgMembership(userId);

    if (!membership) {
      return res.status(403).json({ message: 'You must be a member of an organization' });
    }

    req.userMembership = membership;
    req.userOrganizationId = membership.organizationId._id || membership.organizationId;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking organization membership' });
  }
}

async function requireOrgAdmin(req, res, next) {
  try {
    const userId = req.user._id;
    const membership = await getUserOrgMembership(userId);

    if (!membership) {
      return res.status(403).json({ message: 'You must be a member of an organization' });
    }

    if (membership.role !== 'admin') {
      return res.status(403).json({ message: 'Organization admin access required' });
    }

    req.userMembership = membership;
    req.userOrganizationId = membership.organizationId._id || membership.organizationId;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking organization membership' });
  }
}

module.exports = {
  requireOrgMember,
  requireOrgAdmin,
};
