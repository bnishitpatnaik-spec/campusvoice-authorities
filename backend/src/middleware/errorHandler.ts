import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
    })
    return
  }
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
  })
}
