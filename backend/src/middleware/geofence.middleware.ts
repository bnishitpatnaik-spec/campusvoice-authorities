import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'

// VIT Chennai Campus Center
const VIT_LAT = 12.8406
const VIT_LNG = 80.1534
const RADIUS_METERS = 1000

/**
 * Haversine formula — returns distance in meters between two GPS coords
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Gate 1 — Geofence check middleware.
 * Expects req.body.lat and req.body.lng when status === 'resolved'.
 * Passes through for non-resolve status updates.
 */
export const geofenceCheck = (req: Request, _res: Response, next: NextFunction) => {
  const { status, lat, lng } = req.body

  // Only enforce on resolve submissions
  if (status !== 'resolved') return next()

  const latitude = parseFloat(lat)
  const longitude = parseFloat(lng)

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new ApiError(400, 'GPS coordinates are required to submit a resolution. Please enable location access.')
  }

  const distance = haversineDistance(latitude, longitude, VIT_LAT, VIT_LNG)

  if (distance > RADIUS_METERS) {
    throw new ApiError(
      403,
      `Unauthorized: Resolution must be submitted from within VIT Chennai campus boundaries. You are ${Math.round(distance)}m away (limit: ${RADIUS_METERS}m).`
    )
  }

  // Attach verified location to request for downstream use
  ;(req as any).resolverLocation = {
    lat: latitude,
    lng: longitude,
    distanceFromCampus: Math.round(distance),
    verifiedAt: new Date().toISOString(),
  }

  next()
}
