import { Router } from 'express'
import { sendNotification, getNotificationHistory } from '../controllers/notification.controller'

const router = Router()
router.post('/send', sendNotification)
router.get('/history', getNotificationHistory)
export default router
