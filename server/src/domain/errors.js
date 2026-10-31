export class DomainError extends Error {
  constructor(code, message, details = {}, status = 409) {
    super(message);
    Object.assign(this, { code, details, status });
  }
}
export function requireCondition(condition, code, message, details) {
  if (!condition) throw new DomainError(code, message, details);
}
