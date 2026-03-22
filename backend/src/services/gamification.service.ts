import { db } from '../config/firebase'

export const POINTS = {
  COMPLAINT_RESOLVED: 20,
  RAISE_COMPLAINT: 10,
  AI_VERIFIED: 5,
  UPVOTE_RECEIVED: 2,
  GIVE_UPVOTE: 1,
  FACULTY_ENDORSEMENT: 15,
  RATE_RESOLUTION: 5,
}

export const getLevel = (points: number) => {
  if (points >= 500) return { level: 5, title: 'Campus Legend' }
  if (points >= 301) return { level: 4, title: 'Campus Hero' }
  if (points >= 151) return { level: 3, title: 'Contributor' }
  if (points >= 51)  return { level: 2, title: 'Reporter' }
  return { level: 1, title: 'Newcomer' }
}

export const updateUserPoints = async (
  email: string,
  pointsToAdd: number
): Promise<void> => {
  try {
    if (!email) return
    const userRef = db.collection('users').doc(email)
    const userDoc = await userRef.get()
    if (!userDoc.exists) return
    const userData = userDoc.data()!
    const currentPoints = Number(userData.points) || 0
    const newPoints = Math.max(0, currentPoints + pointsToAdd)
    const newLevel = getLevel(newPoints)
    await userRef.update({
      points: newPoints,
      level: newLevel.level,
      levelTitle: newLevel.title,
      updatedAt: new Date().toISOString(),
    })
    console.log(`✅ Points: ${email} | ${currentPoints} + ${pointsToAdd} = ${newPoints}`)
  } catch (error: any) {
    console.error('Points error:', error.message)
  }
}
