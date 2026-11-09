/**
 * Centralized error handling.
 * Extracts a meaningful, user-safe message from any error type.
 */

function formatError(err) {
  // Prisma known errors
  if (err.code) {
    switch (err.code) {
      case 'P2002': {
        const fields = err.meta?.target?.join(', ') || 'field';
        return { status: 409, error: `A record with this ${fields} already exists.` };
      }
      case 'P2003':
        return { status: 400, error: `Invalid reference: related record not found (${err.meta?.field_name || 'unknown field'}).` };
      case 'P2025':
        return { status: 404, error: 'Record not found.' };
      case 'P2014':
        return { status: 400, error: 'This change would violate a required relation.' };
      case 'P2000': {
        const col = err.meta?.column_name || 'field';
        return { status: 400, error: `Value too long for ${col}.` };
      }
      default:
        if (err.code.startsWith('P')) {
          return { status: 400, error: `Database error: ${err.message}` };
        }
    }
  }

  // Prisma validation errors (wrong types, missing fields)
  if (err.name === 'PrismaClientValidationError' || err.message?.includes('Invalid value provided')) {
    // Extract the useful part from Prisma's verbose message
    const match = err.message.match(/Argument `(\w+)`: (.+?)(?:\n|$)/);
    if (match) {
      return { status: 400, error: `Invalid value for "${match[1]}": ${match[2]}` };
    }
    const missingMatch = err.message.match(/Argument `(\w+)` is missing/);
    if (missingMatch) {
      return { status: 400, error: `Missing required field: "${missingMatch[1]}"` };
    }
    return { status: 400, error: `Validation error: ${err.message.split('\n').pop().trim()}` };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return { status: 401, error: 'Invalid token.' };
  }
  if (err.name === 'TokenExpiredError') {
    return { status: 401, error: 'Token has expired.' };
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return { status: 400, error: 'File is too large.' };
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return { status: 400, error: 'Too many files uploaded.' };
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return { status: 400, error: 'Unexpected file field.' };
  }

  // Standard errors with a message
  if (err.message) {
    // Don't leak internal stack traces — keep only the first line
    const firstLine = err.message.split('\n')[0].trim();
    return { status: 500, error: firstLine };
  }

  return { status: 500, error: 'An unexpected error occurred.' };
}

/**
 * Express error-handling middleware.
 * Mount as the LAST middleware in the app.
 */
function globalErrorHandler(err, req, res, _next) {
  console.error(`[${req.method} ${req.path}]`, err);
  const { status, error } = formatError(err);
  res.status(status).json({ error });
}

module.exports = { formatError, globalErrorHandler };
