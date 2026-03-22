import * as admin from 'firebase-admin'
import { config } from './env'

const getPrivateKey = (): string => {
  let key = config.FIREBASE_PRIVATE_KEY
  key = key.replace(/^["']|["']$/g, '')
  key = key.replace(/\\n/g, '\n')
  return key.trim()
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      } as admin.ServiceAccount),
    })
    console.log('✅ Firebase Admin initialized')
  } catch (error: any) {
    console.error('❌ Firebase error:', error.message)
  }
}

export const db = admin.firestore()
export default admin
