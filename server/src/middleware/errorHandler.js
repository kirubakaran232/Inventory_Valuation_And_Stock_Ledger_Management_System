export function errorHandler(err, req, res, next) {
  const invalid = err.name === 'ZodError';
  const malformedJson = err.type === 'entity.parse.failed';
  const status = invalid ? 400 : err.code === 11000 ? 409 : err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    code: malformedJson
      ? 'INVALID_JSON'
      : invalid
        ? 'VALIDATION_ERROR'
        : err.code === 11000
          ? 'DUPLICATE_RECORD'
          : err.code || 'INTERNAL_ERROR',
    message: malformedJson
      ? 'Request body must be valid JSON.'
      : invalid
        ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
        : status >= 500
          ? 'Unexpected server error'
          : err.message,
    details: invalid ? err.issues : err.details || {},
  });
}
