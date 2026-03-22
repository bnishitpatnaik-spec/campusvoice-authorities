import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/env'
import { ApiError } from '../utils/ApiError'
import { asyncHandler } from '../utils/asyncHandler'

export const authenticateAdmin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization as string
    if (!authHeader?.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required')
    }
    const token = authHeader.substring(7)
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as any
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
        institute: decoded.institute || '',
      }
      next()
    } catch {
      throw new ApiError(401, 'Invalid or expired token')
    }
  }
)
