import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import { config } from './config/env'
import './config/firebase' // initialize Firebase Admin
import complaintRoutes from './routes/complaint.routes'
import userRoutes from './routes/user.routes'
import analyticsRoutes from './routes/analytics.routes'
import notificationRoutes from './routes/notification.routes'
import { errorHandler } from './middleware/errorHandler'

const app = express()

app.use(cors({
  origin: [
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8083',
    'http://127.0.0.1:8080',
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.options('*', cors())
app.use(morgan('dev'))
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'CampusVoice Admin API running',
    timestamp: new Date().toISOString(),
    port: config.PORT,
  })
})

app.use('/api/complaints', complaintRoutes)
app.use('/api/users', userRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/notifications', notificationRoutes)

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

app.use(errorHandler)

app.listen(Number(config.PORT), () => {
  console.log(`🚀 CampusVoice Admin API on port ${config.PORT}`)
  console.log(`   Environment: ${config.NODE_ENV}`)
})
