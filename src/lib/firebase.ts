import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAFG3zIER8mIi1ssPZLEDF6TELv2ox4r7I",
  authDomain: "campusvoice-eed4c.firebaseapp.com",
  projectId: "campusvoice-eed4c",
  storageBucket: "campusvoice-eed4c.firebasestorage.app",
  messagingSenderId: "825165122081",
  appId: "1:825165122081:web:ab5938bf1523e4894d7160"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export default app
