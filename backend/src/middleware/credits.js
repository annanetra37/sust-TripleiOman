const prisma = require('../config/prisma');

function requireCredits(costPerUnit, getUnitCount) {
  return async (req, res, next) => {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { creditBalance: true },
    });

    const units = typeof getUnitCount === 'function' ? getUnitCount(req) : 1;
    const totalCost = costPerUnit * units;

    if (company.creditBalance < totalCost) {
      return res.status(403).json({
        error: 'Insufficient credits',
        required: totalCost,
        available: company.creditBalance,
        costPerUnit,
        units,
      });
    }

    req.creditCost = totalCost;
    next();
  };
}

async function deductCredits(companyId, userId, credits, type, description, fileId) {
  await prisma.$transaction([
    prisma.company.update({
      where: { id: companyId },
      data: { creditBalance: { decrement: credits } },
    }),
    prisma.creditTransaction.create({
      data: {
        companyId,
        userId,
        transactionType: type,
        creditsUsed: credits,
        description,
        relatedFileId: fileId,
      },
    }),
  ]);
}

module.exports = { requireCredits, deductCredits };
