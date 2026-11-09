class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function formatError(err) {
  if (err instanceof HttpError) return { status: err.status, error: err.message, details: err.details };
  if (err.code === 'P2002') return { status: 409, error: `A record with this ${(err.meta?.target || ['value']).join(', ')} already exists.` };
  if (err.code === 'P2025') return { status: 404, error: 'Record not found.' };
  if (err.code === 'P2003') return { status: 400, error: 'Invalid reference to a related record.' };
  if (err.code === 'LIMIT_FILE_SIZE') return { status: 400, error: 'File is too large.' };
  if (err.type === 'entity.parse.failed') return { status: 400, error: 'Invalid JSON body.' };
  return { status: 500, error: 'An unexpected error occurred.' };
}

function globalErrorHandler(err, req, res, _next) {
  const out = formatError(err);
  if (out.status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(out.status).json({ error: out.error, ...(out.details ? { details: out.details } : {}) });
}

module.exports = { HttpError, asyncHandler, globalErrorHandler, formatError };
