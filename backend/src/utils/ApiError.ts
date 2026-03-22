export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public errors: any[] = []
  ) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}
