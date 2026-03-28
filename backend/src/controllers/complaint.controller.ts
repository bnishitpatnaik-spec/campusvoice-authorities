import { Request, Response } from 'express'
import { db } from '../config/firebase'
import { asyncHandler } from '../utils/asyncHandler'
import { ApiResponse } from '../utils/ApiResponse'
import { ApiError } from '../utils/ApiError'
import { uploadBase64Image } from '../services/cloudinary.service'
import { updateUserPoints, POINTS } from '../services/gamification.service'
import { sendStatusNotification } from '../services/notification.service'
import { runResolutionVerification } from '../services/roboflow.service'

interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; institute: string }
}

export const getAllComplaints = asyncHandler(async (req: Request, res: Response) => {
  const { status, category, sort = 'newest' } = req.query
  let query: FirebaseFirestore.Query = db.collection('complaints')

  if (status && status !== 'all') {
    query = query.where('status', '==', status)
  }
  if (category && category !== 'all') {
    query = query.where('category', '==', category)
  }

  const snapshot = await query.get()
  let complaints = snapshot.docs.map(doc => {
    const data = doc.data()
    const upvoteCount = typeof data.upvoteCount === 'number'
      ? data.upvoteCount
      : (Array.isArray(data.upvotes) ? data.upvotes.length : 0)
    return { id: doc.id, ...data, upvotes: upvoteCount, upvoteCount }
  }) as any[]

  if (sort === 'newest') {
    complaints.sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )
  } else if (sort === 'oldest') {
    complaints.sort((a, b) =>
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    )
  } else if (sort === 'upvotes') {
    complaints.sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0))
  } else if (sort === 'overdue') {
    complaints.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      return 0
    })
  }

  return res.status(200).json(
    new ApiResponse(200, { complaints, total: complaints.length }, 'Complaints fetched')
  )
})

export const getComplaintById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  const docSnap = await db.collection('complaints').doc(id).get()
  if (!docSnap.exists) throw new ApiError(404, 'Complaint not found')

  const complaintData = docSnap.data()!
  let submitterName = complaintData.submittedByName || complaintData.submittedBy || 'Unknown'

  if (complaintData.submittedBy) {
    try {
      const userDoc = await db.collection('users').doc(complaintData.submittedBy).get()
      if (userDoc.exists) submitterName = userDoc.data()!.name || submitterName
    } catch {}
  }

  const commentsSnap = await db.collection('comments').where('complaintId', '==', id).get()
  const comments = commentsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) =>
      new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
    )

  return res.status(200).json(
    new ApiResponse(200, { complaint: { id: docSnap.id, ...complaintData, submitterName }, comments }, 'Complaint fetched')
  )
})

export const updateComplaintStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const { status, resolutionNote, resolutionImageBase64, rejectionReason } = req.body
  const resolverLocation = (req as any).resolverLocation || null

  if (!status) throw new ApiError(400, 'Status is required')

  const validStatuses = ['pending', 'in_progress', 'resolved', 'rejected']
  if (!validStatuses.includes(status)) throw new ApiError(400, 'Invalid status')

  const complaintRef = db.collection('complaints').doc(id)
  const complaintDoc = await complaintRef.get()
  if (!complaintDoc.exists) throw new ApiError(404, 'Complaint not found')

  const complaintData = complaintDoc.data()!
  const updateData: Record<string, any> = {
    status,
    updatedAt: new Date().toISOString(),
    lastUpdatedBy: req.user?.email || 'authority',
  }

  if (status === 'resolved') {
    let resolutionImageUrl = ''
    if (resolutionImageBase64) {
      const uploaded = await uploadBase64Image(resolutionImageBase64, 'campusvoice/resolutions')
      resolutionImageUrl = uploaded.url
    }

    // Gate 2 + Gate 3: AI verification (YOLO → CLIP → Claude fallback)
    const beforeImageUrl = complaintData.imageUrl || ''
    if (resolutionImageUrl && beforeImageUrl) {
      const aiResult = await runResolutionVerification(beforeImageUrl, resolutionImageUrl)
      if (!aiResult.passed) {
        throw new ApiError(422, `AI Verification Failed [${aiResult.gate}]: ${aiResult.reason}`)
      }
      updateData.aiVerified = true
      updateData.aiVerificationGate = aiResult.gate
      updateData.aiVerificationScore = aiResult.score ?? null
    }

    const createdAt = new Date(complaintData.createdAt || Date.now())
    const resolvedAt = new Date()
    const daysToResolve = Math.floor((resolvedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24))

    updateData.resolvedAt = resolvedAt.toISOString()
    updateData.daysToResolve = daysToResolve
    updateData.resolutionNote = resolutionNote || ''
    updateData.resolutionImageUrl = resolutionImageUrl
    // Store geofence-verified location metadata
    if (resolverLocation) {
      updateData.resolverLocation = resolverLocation
      updateData.geofenceVerified = true
    }

    if (complaintData.submittedBy) {
      await updateUserPoints(complaintData.submittedBy, POINTS.COMPLAINT_RESOLVED)
      try {
        const userRef = db.collection('users').doc(complaintData.submittedBy)
        const userDoc = await userRef.get()
        if (userDoc.exists) {
          await userRef.update({ complaintsResolved: (userDoc.data()!.complaintsResolved || 0) + 1 })
        }
      } catch {}
    }
  }

  if (status === 'rejected') {
    updateData.rejectionReason = rejectionReason || 'Complaint rejected by authority'
    updateData.rejectedAt = new Date().toISOString()
  }

  if (status === 'in_progress') {
    updateData.acknowledgedAt = new Date().toISOString()
    updateData.progressNote = resolutionNote || ''
  }

  await complaintRef.update(updateData)

  if (complaintData.submittedBy) {
    await sendStatusNotification(id, complaintData.submittedBy, status, complaintData.title || 'Your complaint').catch(console.error)
  }

  const updatedDoc = await complaintRef.get()
  console.log(`✅ Complaint ${id} updated to ${status}`)

  return res.status(200).json(
    new ApiResponse(200, { id, ...updatedDoc.data() }, `Complaint ${status} successfully`)
  )
})

export const addAuthorityComment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params
  const { text, isInternal = false } = req.body
  if (!text?.trim()) throw new ApiError(400, 'Comment text required')

  const commentRef = db.collection('comments').doc()
  const commentData = {
    id: commentRef.id,
    complaintId: id,
    userId: req.user?.email || 'authority',
    userName: 'Campus Authority',
    text: text.trim(),
    isInternal,
    isAuthorityComment: true,
    createdAt: new Date().toISOString(),
  }
  await commentRef.set(commentData)

  return res.status(201).json(new ApiResponse(201, commentData, 'Comment added'))
})

export const autoRejectNoLocation = asyncHandler(async (req: Request, res: Response) => {
  const snapshot = await db.collection('complaints').where('status', '==', 'pending').get()
  const batch = db.batch()
  let rejectedCount = 0

  for (const doc of snapshot.docs) {
    const data = doc.data()
    const hasLocation = data.location && data.location.trim() !== ''
    if (!hasLocation) {
      batch.update(doc.ref, {
        status: 'rejected',
        rejectionReason: 'Complaint rejected: Location not mentioned. Please resubmit with specific location details.',
        rejectedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      rejectedCount++
      if (data.submittedBy) {
        await sendStatusNotification(doc.id, data.submittedBy, 'rejected', data.title || 'Your complaint').catch(console.error)
      }
    }
  }

  await batch.commit()
  return res.status(200).json(
    new ApiResponse(200, { rejectedCount }, `${rejectedCount} complaints auto rejected (no location)`)
  )
})
