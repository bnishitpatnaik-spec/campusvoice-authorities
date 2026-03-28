import { Request, Response, NextFunction } from 'express'
import { ApiError } from '../utils/ApiError'

// VIT Chennai Campus Center
const VIT_LAT = 12.8406
const VIT_LNG = 80.1534
const RADIUS_METERS = 1000

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const geofenceCheck = (req: Request, _res: Response, next: NextFunction) => {
  try {
    const { status, lat, lng } = req.body

    // Only enforce on resolve submissions
    if (status !== 'resolved') return next()

    // Accept both number and string formats
    const latitude = typeof lat === 'number' ? lat : parseFloat(lat)
    const longitude = typeof lng === 'number' ? lng : parseFloat(lng)

    if (isNaN(latitude) || isNaN(longitude)) {
      return next(new ApiError(400, 'GPS coordinates are required to submit a resolution. Please enable location access and try again.'))
    }

    const distance = haversineDistance(latitude, longitude, VIT_LAT, VIT_LNG)
    console.log(`📍 Geofence check: lat=${latitude}, lng=${longitude}, distance=${Math.round(distance)}m`)

    if (distance > RADIUS_METERS) {
      return next(new ApiError(
        403,
        `You must be within VIT Chennai campus to submit a resolution. You are ${Math.round(distance)}m away (limit: ${RADIUS_METERS}m).`
      ))
    }

    // Attach verified location to request
    ;(req as any).resolverLocation = {
      lat: latitude,
      lng: longitude,
      distanceFromCampus: Math.round(distance),
      verifiedAt: new Date().toISOString(),
    }

    next()
  } catch (err) {
    next(err)
  }
}
