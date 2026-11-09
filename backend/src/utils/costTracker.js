const prisma = require('../config/prisma');

// Pricing per million tokens (approximate as of 2025)
const MODEL_PRICING = {
  'claude-sonnet-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
  'tesseract': { input: 0, output: 0, perPage: 0.001 },
  'pdf-parse': { input: 0, output: 0, perPage: 0.0001 },
};

/**
 * Log an AI/processing cost to the database.
 *
 * For AI calls, pass inputTokens/outputTokens and the cost is derived from
 * MODEL_PRICING.  For non-AI operations (e.g. report generation) pass
 * `estimatedCostOverride` in USD to record it directly.
 */
async function logCost({ companyId, userId, operation, model, inputTokens, outputTokens, durationMs, relatedId, metadata, estimatedCostOverride }) {
  try {
    const totalTokens = (inputTokens || 0) + (outputTokens || 0);

    // Calculate estimated cost
    let estimatedCost = 0;
    if (estimatedCostOverride != null) {
      estimatedCost = Number(estimatedCostOverride) || 0;
    } else {
      const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-5'];
      if (inputTokens) estimatedCost += (inputTokens / 1_000_000) * pricing.input;
      if (outputTokens) estimatedCost += (outputTokens / 1_000_000) * pricing.output;
      if (pricing.perPage && metadata?.pages) estimatedCost += metadata.pages * pricing.perPage;
    }

    estimatedCost = Math.round(estimatedCost * 1_000_000) / 1_000_000; // 6 decimal places

    // Try to create — if CostLog table doesn't exist, the catch will handle it
    await prisma.costLog.create({
      data: {
        companyId, userId, operation, model,
        inputTokens, outputTokens, totalTokens,
        estimatedCost, durationMs,
        relatedId, metadata,
      },
    });

    console.log(`[Cost] ${operation} | ${model || 'n/a'} | ${totalTokens} tokens | $${estimatedCost.toFixed(6)} | ${durationMs || 0}ms`);
  } catch (err) {
    console.error('[Cost] Failed to log cost:', err.message);
  }
}

/**
 * Wrap an Anthropic API call and automatically log its cost.
 */
async function trackedAICall(client, params, { companyId, userId, operation, relatedId, metadata }) {
  const start = Date.now();
  const response = await client.messages.create(params);
  const durationMs = Date.now() - start;

  await logCost({
    companyId, userId, operation,
    model: params.model,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    durationMs,
    relatedId,
    metadata,
  });

  return response;
}

module.exports = { logCost, trackedAICall, MODEL_PRICING };
