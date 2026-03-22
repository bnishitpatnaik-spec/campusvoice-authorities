import { Request, Response } from 'express'
import { db } from '../config/firebase'
import { asyncHandler } from '../utils/asyncHandler'
import { ApiResponse } from '../utils/ApiResponse'

export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const snap = await db.collection('complaints').get()
  const all = snap.docs.map(d => d.data()) as any[]

  const total = all.length
  const resolved = all.filter(c => c.status === 'resolved').length
  const inProgress = all.filter(c => c.status === 'in_progress').length
  const pending = all.filter(c => c.status === 'pending').length
  const rejected = all.filter(c => c.status === 'rejected').length
  const overdue = all.filter(c => c.isOverdue).length

  const now = new Date()
  const weeklyTrends = Array.from({ length: 6 }, (_, i) => {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - (5 - i) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const submitted = all.filter(c => {
      const d = new Date(c.createdAt || 0)
      return d >= weekStart && d < weekEnd
    }).length

    const weekResolved = all.filter(c => {
      if (c.status !== 'resolved') return false
      const d = new Date(c.resolvedAt || 0)
      return d >= weekStart && d < weekEnd
    }).length

    return { week: `W${i + 1}`, submitted, resolved: weekResolved }
  })

  const categories = ['Infrastructure', 'Safety', 'Technology', 'Academic', 'Health', 'Hygiene', 'Other']
  const categoryDistribution = categories.map(cat => ({
    name: cat,
    value: all.filter(c => c.category === cat).length,
  }))

  const categoryMap: Record<string, string> = {
    Infrastructure: 'Facilities', Safety: 'Security', Technology: 'IT Services',
    Academic: 'Academic', Health: 'Student Services', Hygiene: 'Facilities', Other: 'Student Services',
  }
  const depts = ['Security', 'IT Services', 'Facilities', 'Academic', 'Student Services']
  const departmentPerformance = depts.map(dept => {
    const deptComplaints = all.filter(c => categoryMap[c.category] === dept)
    return {
      department: dept,
      resolved: deptComplaints.filter(c => c.status === 'resolved').length,
      pending: deptComplaints.filter(c => c.status !== 'resolved').length,
    }
  })

  const resolvedComplaints = all.filter(c => c.status === 'resolved' && c.daysToResolve !== undefined)
  const avgResolutionTime = resolvedComplaints.length > 0
    ? Math.round(resolvedComplaints.reduce((sum, c) => sum + (c.daysToResolve || 0), 0) / resolvedComplaints.length)
    : 0

  return res.status(200).json(
    new ApiResponse(200, {
      totals: { total, resolved, inProgress, pending, rejected, overdue },
      weeklyTrends,
      categoryDistribution,
      departmentPerformance,
      avgResolutionTime,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    }, 'Analytics fetched')
  )
})
