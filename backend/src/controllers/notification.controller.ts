import { Request, Response } from 'express'
import { db } from '../config/firebase'
import * as admin from 'firebase-admin'
import { asyncHandler } from '../utils/asyncHandler'
import { ApiResponse } from '../utils/ApiResponse'
import { ApiError } from '../utils/ApiError'

interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; institute: string }
}

export const sendNotification = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { title, message, targetAudience = 'all' } = req.body
  if (!title || !message) throw new ApiError(400, 'Title and message required')

  let query: FirebaseFirestore.Query = db.collection('users')
  if (targetAudience === 'students') query = query.where('role', '==', 'student')
  else if (targetAudience === 'faculty') query = query.where('role', '==', 'faculty')

  const usersSnap = await query.get()
  const tokens: string[] = []
  usersSnap.docs.forEach(doc => {
    const fcmToken = doc.data().fcmToken
    if (fcmToken) tokens.push(fcmToken)
  })

  let sentCount = 0
  if (tokens.length > 0) {
    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title, body: message },
        data: { type: 'broadcast' },
      })
      sentCount = response.successCount
    } catch (e: any) {
      console.error('FCM error:', e.message)
    }
  }

  // Save to global notifications collection
  await db.collection('notifications').add({
    title,
    message,
    targetAudience,
    createdAt: admin.firestore.Timestamp.now(),
    sentBy: 'admin',
    readBy: [],
  })

  // If targeting all users, also save to each user's personal notification feed
  if (targetAudience === 'All Users' || targetAudience === 'all') {
    const allUsers = await db.collection('users').get()
    const batch = db.batch()
    allUsers.docs.forEach(userDoc => {
      const ref = db.collection('userNotifications').doc(userDoc.id).collection('items').doc()
      batch.set(ref, {
        title,
        message,
        targetAudience,
        createdAt: admin.firestore.Timestamp.now(),
        sentBy: 'admin',
        read: false,
      })
    })
    await batch.commit()
  }

  return res.status(200).json(
    new ApiResponse(200, { success: true }, 'Notification sent')
  )
})

export const getNotificationHistory = asyncHandler(async (req: Request, res: Response) => {
  const snap = await db.collection('notifications').get()
  const notifications = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a: any, b: any) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime())

  return res.status(200).json(new ApiResponse(200, notifications, 'Notifications fetched'))
})
