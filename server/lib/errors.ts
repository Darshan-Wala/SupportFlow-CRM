export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = "Authentication required") {
    return new ApiError(401, msg);
  }
  static forbidden(msg = "You don't have permission to do that") {
    return new ApiError(403, msg);
  }
  static notFound(msg = "Not found") {
    return new ApiError(404, msg);
  }
  static conflict(msg: string) {
    return new ApiError(409, msg);
  }
}
