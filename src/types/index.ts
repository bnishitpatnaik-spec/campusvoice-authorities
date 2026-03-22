export interface Complaint {
  id: string;
  title: string;
  description: string;
  category: string;
  location?: string;
  imageUrl?: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
  userId: string;
  userName: string;
  userEmail?: string;
  institute?: string;
  upvotes?: number;
  upvotedBy?: string[];
  facultyEndorsed?: boolean;
  facultyName?: string;
  aiVerified?: boolean;
  deadline?: any;
  rejectionReason?: string;
  resolutionImageUrl?: string;
  resolutionNote?: string;
  resolvedAt?: any;
  daysToResolve?: number;
  createdAt?: any;
  updatedAt?: any;
  comments?: Comment[];
  // Satisfaction rating (submitted by user after resolution)
  satisfactionRating?: number;
  satisfactionFeedback?: string;
  ratedAt?: any;
  // Re-raised complaint flag
  isReRaise?: boolean;
  originalComplaintId?: string;
  // Submitter fields (users app may use different field names)
  submittedBy?: string;
  submittedByName?: string;
  upvoteCount?: number;
  // Faculty endorsement (Firestore may use facultyEndorsed or isEndorsed)
  isEndorsed?: boolean;
  endorsedBy?: string;
  endorsedAt?: any;
}

export interface Comment {
  id: string;
  text: string;
  authorName: string;
  authorRole: string;
  createdAt: any;
  isInternal?: boolean;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  collegeId?: string;
  institute?: string;
  role: string;
  points?: number;
  level?: number;
  complaintsCount?: number;
  createdAt?: any;
  status?: string;
  photoURL?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  target: string;
  sentAt: any;
  status: string;
}
