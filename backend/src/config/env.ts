import dotenv from 'dotenv'
dotenv.config()

export const config = {
  PORT: process.env.PORT || '5001',
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8081',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'campusvoice_admin_secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || '',

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // Gmail SMTP
  GMAIL_USER: process.env.GMAIL_USER || '',
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD || '',

  // AI Service
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000',

  // Anthropic (Claude)
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  // Roboflow
  ROBOFLOW_API_KEY: process.env.ROBOFLOW_API_KEY || '',
  ROBOFLOW_MODEL_ID: process.env.ROBOFLOW_MODEL_ID || '',
  ROBOFLOW_WORKSPACE: process.env.ROBOFLOW_WORKSPACE || '',
  ROBOFLOW_WORKFLOW_ID: process.env.ROBOFLOW_WORKFLOW_ID || '',
}
