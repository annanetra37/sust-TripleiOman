const prisma = require('../config/prisma');

/**
 * Log a user action for audit tracking.
 */
async function logActivity(userId, companyId, action, detail, metadata, ipAddress) {
  try {
    await prisma.activityLog.create({
      data: { userId, companyId, action, detail, metadata, ipAddress },
    });
  } catch (err) {
    console.error('Activity log failed:', err.message);
  }
}

module.exports = { logActivity };
