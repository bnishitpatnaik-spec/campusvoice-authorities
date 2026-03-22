import { Router } from 'express'
import {
  getAllComplaints,
  getComplaintById,
  updateComplaintStatus,
  addAuthorityComment,
  autoRejectNoLocation,
} from '../controllers/complaint.controller'

const router = Router()

router.get('/', getAllComplaints)
router.get('/:id', getComplaintById)
router.patch('/:id/status', updateComplaintStatus)
router.post('/:id/comment', addAuthorityComment)
router.post('/auto-reject-no-location', autoRejectNoLocation)

export default router
