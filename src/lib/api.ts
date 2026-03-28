const BASE_URL = import.meta.env.VITE_API_URL || 'https://campusvoice-backend-4ct0.onrender.com/api'

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('admin_token') || ''}`,
})

// Retry with exponential backoff — handles Render cold starts
const request = async (endpoint: string, options: RequestInit = {}, retries = 2) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: { ...getHeaders(), ...(options.headers as Record<string, string>) },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Request failed')
      return data
    } catch (error: any) {
      const isLast = attempt === retries
      if (isLast) {
        console.error(`API Error [${endpoint}]:`, error.message)
        throw error
      }
      // Wait before retry (cold start can take 30s)
      await new Promise(r => setTimeout(r, 3000 * (attempt + 1)))
    }
  }
}

export const getComplaints = (params?: { status?: string; category?: string; sort?: string }) => {
  const query = new URLSearchParams(params as any).toString()
  return request(`/complaints${query ? `?${query}` : ''}`)
}

export const getComplaintById = (id: string) => request(`/complaints/${id}`)

export const updateComplaintStatus = (
  id: string,
  body: {
    status: string
    resolutionNote?: string
    resolutionImageBase64?: string
    rejectionReason?: string
    lat?: number
    lng?: number
    timestamp?: string
  }
) => request(`/complaints/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) })

export const addComment = (id: string, text: string, isInternal = false) =>
  request(`/complaints/${id}/comment`, { method: 'POST', body: JSON.stringify({ text, isInternal }) })

export const autoRejectNoLocation = () =>
  request('/complaints/auto-reject-no-location', { method: 'POST' })

export const getAllUsers = (role?: string) =>
  request(`/users${role ? `?role=${role}` : ''}`)

export const getAnalytics = () => request('/analytics/summary')

export const sendNotification = (body: { title: string; message: string; targetAudience: string }) =>
  request('/notifications/send', { method: 'POST', body: JSON.stringify(body) })

export const getNotificationHistory = () => request('/notifications/history')
