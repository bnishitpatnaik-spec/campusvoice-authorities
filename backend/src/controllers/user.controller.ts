import { Request, Response } from 'express'
import { db } from '../config/firebase'
import { asyncHandler } from '../utils/asyncHandler'
import { ApiResponse } from '../utils/ApiResponse'

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.query
  let query: FirebaseFirestore.Query = db.collection('users')
  if (role && role !== 'all') {
    query = query.where('role', '==', role)
  }

  const snapshot = await query.get()
  const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[]

  const complaintsSnap = await db.collection('complaints').get()
  const complaintsByUser: Record<string, number> = {}
  complaintsSnap.docs.forEach(doc => {
    const data = doc.data()
    if (data.submittedBy) {
      complaintsByUser[data.submittedBy] = (complaintsByUser[data.submittedBy] || 0) + 1
    }
  })

  const usersWithStats = users.map(user => ({
    ...user,
    totalComplaints: complaintsByUser[user.id] || 0,
  }))

  const totalStudents = users.filter(u => u.role === 'student').length
  const totalFaculty = users.filter(u => u.role === 'faculty').length
  const topContributor = [...usersWithStats].sort((a, b) => (b.points || 0) - (a.points || 0))[0] || null

  return res.status(200).json(
    new ApiResponse(200, { users: usersWithStats, total: users.length, totalStudents, totalFaculty, topContributor }, 'Users fetched')
  )
})
