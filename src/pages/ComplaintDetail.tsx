import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, onSnapshot, getDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateComplaintStatus } from '@/lib/api';
import type { Complaint } from '@/types';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowLeft, MapPin, Star, ThumbsUp, Clock, CheckCircle, XCircle, AlertTriangle, Send, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const REJECT_REASONS = [
  'Location not mentioned',
  'Image does not match description',
  'Duplicate complaint',
  'Outside campus jurisdiction',
  'Insufficient information',
  'Other',
];

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Submitted' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

const ComplaintDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { admin } = useAuth();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitterName, setSubmitterName] = useState('');

  // Action state
  const [progressNote, setProgressNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolutionImage, setResolutionImage] = useState<string | null>(null);
  const [showResolvePanel, setShowResolvePanel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [updating, setUpdating] = useState(false);

  // Geofence state
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number; timestamp: string } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'loading' | 'verified' | 'error'>('idle');
  const [gpsError, setGpsError] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(doc(db, 'complaints', id), (snap) => {
      if (snap.exists()) setComplaint({ id: snap.id, ...snap.data() } as Complaint);
      setLoading(false);
    });
    return () => unsub();
  }, [id]);

  // Stop camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Fetch submitter name from Firestore users collection
  useEffect(() => {
    if (!complaint) return;
    // Use userName if it looks like a real name (not an email)
    const raw = complaint.userName || complaint.submittedByName || complaint.submittedBy || '';
    if (raw && !raw.includes('@')) {
      setSubmitterName(raw);
      return;
    }
    // Look up by userId or submittedBy (email used as doc id in users app)
    const uid = complaint.userId || complaint.submittedBy;
    if (!uid) { setSubmitterName('Unknown'); return; }
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) {
        const name = snap.data()?.name || snap.data()?.displayName;
        if (name) { setSubmitterName(name); return; }
      }
      // Fallback: format email prefix nicely
      const prefix = uid.split('@')[0].replace(/[._]/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase());
      setSubmitterName(prefix || 'Unknown');
    }).catch(() => {
      const prefix = uid.split('@')[0].replace(/[._]/g, ' ')
        .replace(/\b\w/g, (l: string) => l.toUpperCase());
      setSubmitterName(prefix || 'Unknown');
    });
  }, [complaint?.userId, complaint?.submittedBy, complaint?.userName]);

  const getStepIndex = (status: string) => {
    if (status === 'resolved') return 3;
    if (status === 'in_progress') return 2;
    if (status === 'acknowledged') return 1;
    return 0;
  };

  const handleMarkInProgress = async () => {
    if (!id) return;
    setUpdating(true);
    try {
      await updateComplaintStatus(id, { status: 'in_progress' });
      toast.success('Marked as In Progress');
    } catch (e: any) { toast.error(e.message || 'Failed to update.'); }
    setUpdating(false);
  };

  const captureGpsLocation = () => {
    setGpsStatus('loading');
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: new Date().toISOString(),
        });
        setGpsStatus('verified');
      },
      (err) => {
        setGpsStatus('error');
        setGpsError(err.code === 1 ? 'Location permission denied. Please allow access.' : 'Unable to get location. Try again.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleResolve = async () => {
    if (!resolutionImage) {
      toast.error('Please capture or upload a resolution proof photo first');
      return;
    }
    if (!gpsCoords) {
      toast.error('Location verification required. Please verify your location first.');
      return;
    }
    if (!id || !complaint) return;
    setUploading(true);
    try {
      await updateComplaintStatus(id, {
        status: 'resolved',
        resolutionNote,
        resolutionImageBase64: resolutionImage,
        lat: gpsCoords.lat,
        lng: gpsCoords.lng,
        timestamp: gpsCoords.timestamp,
      });
      // Send notification via Firestore for users app
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: complaint.userId,
          title: '✅ Complaint Resolved!',
          body: `Your complaint "${complaint.title}" has been resolved. Please rate.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch { /* ignore */ }
      setShowResolvePanel(false);
      setResolutionImage(null);
      setResolutionNote('');
      setGpsCoords(null);
      setGpsStatus('idle');
      toast.success('Complaint marked as resolved!');
    } catch (e: any) { toast.error(e.message || 'Failed to resolve.'); }
    setUploading(false);
  };

  const handleReject = async () => {
    if (!id || !complaint) return;
    setUpdating(true);
    try {
      await updateComplaintStatus(id, {
        status: 'rejected',
        rejectionReason: `${rejectReason}${rejectNotes ? ': ' + rejectNotes : ''}`,
      });
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: complaint.userId,
          title: '❌ Complaint Rejected',
          body: `Your complaint "${complaint.title}" was rejected. Reason: ${rejectReason}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch { /* ignore */ }
      toast.success('Complaint rejected.');
      setShowReject(false);
    } catch (e: any) { toast.error(e.message || 'Failed to reject.'); }
    setUpdating(false);
  };

  const handleAddNote = async () => {
    if (!id || !internalNote.trim()) return;
    try {
      await addDoc(collection(db, 'complaints', id, 'comments'), {
        text: internalNote,
        authorName: admin?.name || 'Admin',
        authorRole: admin?.role || 'authority',
        isInternal: true,
        createdAt: serverTimestamp(),
      });
      setInternalNote('');
      toast.success('Note added.');
    } catch { toast.error('Failed to add note.'); }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraMode(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 100);
    } catch {
      toast.error('Camera access denied. Please use file upload instead.');
    }
  };

  const capturePhoto = () => {
    const canvas = document.createElement('canvas');
    const video = videoRef.current;
    if (!video) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setResolutionImage(canvas.toDataURL('image/jpeg'));
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setCameraMode(false);
  };

  const stopCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setCameraMode(false);
  };

  const closeResolvePanel = () => {
    setShowResolvePanel(false);
    setResolutionImage(null);
    setResolutionNote('');
    setGpsCoords(null);
    setGpsStatus('idle');
    setGpsError('');
    stopCamera();
  };

  if (loading) return <div className="shimmer h-96 rounded-lg" />;
  if (!complaint) return <div className="text-center text-muted-foreground py-12">Complaint not found.</div>;

  const stepIndex = getStepIndex(complaint.status);
  const deadline = complaint.deadline?.toDate?.() || (complaint.deadline ? new Date(complaint.deadline) : null);
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="space-y-6">
      <Link to="/complaints" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Complaints
      </Link>

      {/* Raised Again notices */}
      {complaint.raisedAgainFrom && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>🔄</span>
          <p style={{ fontSize: '13px', color: '#92400E', margin: 0, fontWeight: 500 }}>
            This complaint was raised again by the user from a previous resolved complaint.
          </p>
        </div>
      )}
      {complaint.raisedAgain && (
        <div style={{ background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '18px', flexShrink: 0 }}>✅</span>
          <p style={{ fontSize: '13px', color: '#1E40AF', margin: 0, fontWeight: 500 }}>
            User raised this complaint again after resolution.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Complaint Info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-layer p-6">
            {complaint.imageUrl && (
              <img src={complaint.imageUrl} alt={complaint.title} className="w-full h-64 object-cover rounded-lg mb-4" />
            )}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">{complaint.title}</h2>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-muted text-muted-foreground">{complaint.category}</span>
                  {complaint.location && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {complaint.location}
                    </span>
                  )}
                  {complaint.facultyEndorsed && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                      <Star className="w-3 h-3" /> Faculty Endorsed
                    </span>
                  )}
                  {complaint.aiVerified && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-md">
                      <ShieldCheck className="w-3 h-3" /> AI Verified
                    </span>
                  )}
                </div>
              </div>
              <span className={`status-badge status-${complaint.status}`}>{complaint.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm text-foreground mt-4 leading-relaxed">{complaint.description}</p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Submitted By</p>
                <p className="text-sm font-medium text-foreground">{submitterName || complaint.userName || 'Unknown'}</p>
                {complaint.userEmail && (
                  <p className="text-xs text-muted-foreground truncate">{complaint.userEmail}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Institute</p>
                <p className="text-sm font-medium text-foreground">{complaint.institute || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Upvotes</p>
                <p className="text-sm font-bold text-primary flex items-center gap-1">
                  <ThumbsUp className="w-3.5 h-3.5" />
                  {complaint.upvoteCount ?? (Array.isArray(complaint.upvotedBy) ? complaint.upvotedBy.length : (complaint.upvotes || 0))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const n = complaint.upvoteCount ?? (Array.isArray(complaint.upvotedBy) ? complaint.upvotedBy.length : (complaint.upvotes || 0));
                    return n === 1 ? '1 student upvoted' : `${n} students upvoted`;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deadline</p>
                {daysLeft !== null ? (
                  <p className={`text-sm font-medium flex items-center gap-1 ${daysLeft < 0 ? 'text-destructive' : daysLeft <= 2 ? 'text-status-pending' : 'text-status-resolved'}`}>
                    <Clock className="w-3.5 h-3.5" />
                    {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                  </p>
                ) : <p className="text-sm text-muted-foreground">No deadline</p>}
              </div>
            </div>

            {/* Faculty Endorsement Banner */}
            {(complaint.isEndorsed || complaint.facultyEndorsed) && (
              <div style={{
                background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
                border: '2px solid #F59E0B',
                borderRadius: '12px',
                padding: '14px 16px',
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                  👨‍🏫
                </div>
                <div>
                  <p style={{ fontWeight: 700, color: '#92400E', fontSize: '15px', margin: 0 }}>⭐ Faculty Endorsed</p>
                  <p style={{ color: '#B45309', fontSize: '13px', margin: '2px 0 0' }}>
                    This complaint has been endorsed by a faculty member and requires priority attention
                  </p>
                  {(complaint.endorsedBy || complaint.facultyName) && (
                    <p style={{ color: '#92400E', fontSize: '12px', marginTop: '4px', fontWeight: 600 }}>
                      Endorsed by: {(complaint.endorsedBy || complaint.facultyName || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </p>
                  )}
                  {complaint.endorsedAt && (
                    <p style={{ color: '#B45309', fontSize: '11px', marginTop: '2px' }}>
                      {new Date(complaint.endorsedAt?.toDate?.() || complaint.endorsedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <div style={{ marginLeft: 'auto', background: '#F59E0B', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  HIGH PRIORITY
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="card-layer p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Timeline</h3>
            <div className="flex items-center gap-2">
              {TIMELINE_STEPS.map((step, i) => (
                <div key={step.key} className="flex items-center flex-1">
                  <motion.div
                    initial={false}
                    animate={{ scale: i <= stepIndex ? 1 : 0.9, opacity: i <= stepIndex ? 1 : 0.4 }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${i <= stepIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    {i <= stepIndex ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs">{i + 1}</span>}
                  </motion.div>
                  <div className="ml-2 min-w-0">
                    <p className={`text-xs font-medium ${i <= stepIndex ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 rounded ${i < stepIndex ? 'bg-primary' : 'bg-muted'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resolution Proof (shown after resolved) */}
          {complaint.status === 'resolved' && (
            <div className="card-layer p-6" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: '#065F46' }}>✅ Resolution Proof</h3>
              {complaint.resolutionImageUrl && (
                <img
                  src={complaint.resolutionImageUrl}
                  alt="Resolution proof"
                  className="w-full rounded-lg mb-3"
                  style={{ maxHeight: '250px', objectFit: 'cover' }}
                />
              )}
              {complaint.resolutionNote && (
                <p className="text-sm p-3 rounded-lg" style={{ color: '#065F46', background: 'white', border: '1px solid #BBF7D0' }}>
                  📝 {complaint.resolutionNote}
                </p>
              )}
              {(complaint as any).geofenceVerified && (complaint as any).resolverLocation && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', padding: '8px 12px', background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '8px' }}>
                  <MapPin className="w-4 h-4" style={{ color: '#059669', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#065F46', margin: 0 }}>✅ Location Verified — VIT Chennai Campus</p>
                    <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>
                      {(complaint as any).resolverLocation.lat.toFixed(5)}, {(complaint as any).resolverLocation.lng.toFixed(5)} · {(complaint as any).resolverLocation.distanceFromCampus}m from campus center
                    </p>
                  </div>
                </div>
              )}
              {complaint.aiVerified && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', padding: '8px 12px', background: '#EFF6FF', border: '1px solid #93C5FD', borderRadius: '8px' }}>
                  <ShieldCheck className="w-4 h-4" style={{ color: '#2563EB', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF', margin: 0 }}>
                      🤖 AI Verified [{(complaint as any).aiVerificationGate || 'YOLO'}]
                    </p>
                    {(complaint as any).aiVerificationScore != null && (
                      <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>
                        Similarity score: {((complaint as any).aiVerificationScore * 100).toFixed(1)}%
                      </p>
                    )}
                  </div>
                </div>
              )}              {complaint.resolvedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  Resolved on {new Date(complaint.resolvedAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
                  {complaint.daysToResolve !== undefined && ` · ${complaint.daysToResolve} days to resolve`}
                </p>
              )}
            </div>
          )}

          {/* Satisfaction Rating */}
          {complaint.satisfactionRating ? (
            <div className="card-layer p-6" style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}>
              <p style={{ fontWeight: 700, color: '#92400E', fontSize: '14px', marginBottom: '10px' }}>⭐ User Satisfaction Rating</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <span key={star} style={{ fontSize: '22px', filter: star <= (complaint.satisfactionRating || 0) ? 'none' : 'grayscale(1) opacity(0.3)' }}>⭐</span>
                ))}
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#92400E', marginLeft: '8px' }}>
                  {complaint.satisfactionRating}/5
                </span>
              </div>
              {complaint.satisfactionFeedback && (
                <p style={{ fontSize: '13px', color: '#6B7280', fontStyle: 'italic', padding: '8px', background: 'white', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                  "{complaint.satisfactionFeedback}"
                </p>
              )}
              {complaint.ratedAt && (
                <p style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '6px' }}>
                  Rated on {new Date(complaint.ratedAt).toLocaleDateString('en-IN')}
                </p>
              )}
            </div>
          ) : complaint.status === 'resolved' && (
            <div className="card-layer p-4" style={{ background: '#F3F4F6', textAlign: 'center' }}>
              <p style={{ fontSize: '13px', color: '#9CA3AF' }}>⭐ Awaiting user rating...</p>
            </div>
          )}
        </div>

        {/* Right: Action Panel */}
        <div className="space-y-4">
          <div className="card-layer p-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Actions</h3>

            {/* Mark In Progress */}
            {complaint.status === 'pending' && (
              <div className="space-y-3">
                <textarea
                  value={progressNote}
                  onChange={e => setProgressNote(e.target.value)}
                  placeholder="Add progress note (optional)..."
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none h-20"
                />
                <motion.button whileTap={{ scale: 0.98 }} onClick={handleMarkInProgress} disabled={updating}
                  className="w-full py-2 rounded-lg bg-status-progress text-primary-foreground text-sm font-semibold disabled:opacity-50">
                  Mark as In Progress
                </motion.button>
              </div>
            )}

            {/* Resolve section */}
            {(complaint.status === 'pending' || complaint.status === 'in_progress') && (
              <div className="pt-3 border-t border-border space-y-3">
                {/* Toggle button */}
                <button
                  onClick={() => showResolvePanel ? closeResolvePanel() : setShowResolvePanel(true)}
                  className="w-full py-2 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: showResolvePanel ? '#F3F4F6' : '#059669',
                    color: showResolvePanel ? '#374151' : 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {showResolvePanel ? '✕ Cancel Resolution' : '✅ Mark as Resolved'}
                </button>

                {/* Resolution panel */}
                {showResolvePanel && (
                  <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ fontWeight: 700, color: '#065F46', fontSize: '14px', marginBottom: '12px' }}>
                      📸 Upload Resolution Proof
                    </h4>

                    {/* Gate 1: GPS Location Verification */}
                    <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${gpsStatus === 'verified' ? '#86EFAC' : gpsStatus === 'error' ? '#FCA5A5' : '#D1FAE5'}`, background: gpsStatus === 'verified' ? '#ECFDF5' : gpsStatus === 'error' ? '#FEF2F2' : 'white' }}>
                      {gpsStatus === 'idle' && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>📍 Step 1: Verify your campus location</span>
                          <button
                            onClick={captureGpsLocation}
                            style={{ padding: '5px 12px', background: '#059669', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}
                          >
                            Get Location
                          </button>
                        </div>
                      )}
                      {gpsStatus === 'loading' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '18px' }}>⏳</span>
                          <span style={{ fontSize: '12px', color: '#374151' }}>Acquiring GPS signal...</span>
                        </div>
                      )}
                      {gpsStatus === 'verified' && gpsCoords && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '18px' }}>✅</span>
                          <div>
                            <p style={{ fontSize: '12px', color: '#065F46', fontWeight: 700, margin: 0 }}>Location Verified — Within VIT Chennai Campus</p>
                            <p style={{ fontSize: '11px', color: '#6B7280', margin: '2px 0 0' }}>
                              📍 {gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}
                            </p>
                          </div>
                        </div>
                      )}
                      {gpsStatus === 'error' && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '16px' }}>❌</span>
                            <span style={{ fontSize: '12px', color: '#DC2626', fontWeight: 500 }}>{gpsError}</span>
                          </div>
                          <button
                            onClick={captureGpsLocation}
                            style={{ padding: '4px 10px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Capture options */}
                    {!resolutionImage && !cameraMode && (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <button
                          onClick={startCamera}
                          style={{ flex: 1, padding: '10px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                        >
                          📷 Take Photo
                        </button>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          style={{ flex: 1, padding: '10px', background: '#0EA5E9', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                        >
                          🖼️ From Gallery
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => setResolutionImage(ev.target?.result as string);
                            reader.readAsDataURL(file);
                          }}
                        />
                      </div>
                    )}

                    {/* Camera view */}
                    {cameraMode && !resolutionImage && (
                      <div style={{ marginBottom: '12px' }}>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          style={{ width: '100%', borderRadius: '8px', background: '#000', maxHeight: '220px', objectFit: 'cover' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            onClick={capturePhoto}
                            style={{ flex: 1, padding: '10px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px' }}
                          >
                            📸 Capture
                          </button>
                          <button
                            onClick={stopCamera}
                            style={{ padding: '10px 16px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Image preview */}
                    {resolutionImage && (
                      <div style={{ marginBottom: '12px' }}>
                        <p style={{ fontSize: '12px', color: '#065F46', fontWeight: 600, marginBottom: '6px' }}>✅ Proof captured:</p>
                        <img
                          src={resolutionImage}
                          alt="Resolution proof"
                          style={{ width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #86EFAC' }}
                        />
                        <button
                          onClick={() => setResolutionImage(null)}
                          style={{ marginTop: '6px', padding: '4px 12px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                        >
                          Retake
                        </button>
                      </div>
                    )}

                    {/* Resolution note */}
                    <textarea
                      value={resolutionNote}
                      onChange={e => setResolutionNote(e.target.value)}
                      placeholder="Describe how the problem was fixed..."
                      rows={3}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #86EFAC', fontSize: '13px', background: 'white', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }}
                    />

                    {/* Submit */}
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={handleResolve}
                      disabled={!resolutionImage || uploading || gpsStatus !== 'verified'}
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: (!resolutionImage || gpsStatus !== 'verified') ? '#D1FAE5' : '#059669',
                        color: (!resolutionImage || gpsStatus !== 'verified') ? '#6B7280' : 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: (!resolutionImage || gpsStatus !== 'verified') ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                        fontSize: '14px',
                      }}
                    >
                      {uploading ? '⏳ Verifying & Uploading...' : '✅ Confirm Resolved'}
                    </motion.button>
                  </div>
                )}
              </div>
            )}

            {/* Reject section */}
            {complaint.status !== 'resolved' && complaint.status !== 'rejected' && (
              <div className="pt-3 border-t border-border">
                {!showReject ? (
                  <button onClick={() => setShowReject(true)}
                    className="w-full py-2 rounded-lg border border-destructive text-destructive text-sm font-semibold hover:bg-destructive/5 transition-colors">
                    <XCircle className="w-4 h-4 inline mr-1" /> Reject Complaint
                  </button>
                ) : (
                  <div className="space-y-3">
                    <select value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground">
                      {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <textarea value={rejectNotes} onChange={e => setRejectNotes(e.target.value)}
                      placeholder="Additional notes..."
                      className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none h-16" />
                    <motion.button whileTap={{ scale: 0.98 }} onClick={handleReject} disabled={updating}
                      className="w-full py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-semibold disabled:opacity-50">
                      Confirm Reject
                    </motion.button>
                    <button onClick={() => setShowReject(false)} className="w-full text-xs text-muted-foreground hover:underline">Cancel</button>
                  </div>
                )}
              </div>
            )}

            {/* Already rejected info */}
            {complaint.status === 'rejected' && complaint.rejectionReason && (
              <div className="pt-3 border-t border-border">
                <p className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Rejection Reason
                </p>
                <p className="text-sm text-muted-foreground">{complaint.rejectionReason}</p>
              </div>
            )}
          </div>

          {/* Internal Notes */}
          <div className="card-layer p-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">Internal Notes</h3>
            <div className="flex gap-2">
              <input value={internalNote} onChange={e => setInternalNote(e.target.value)} placeholder="Add a note..."
                className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground" />
              <motion.button whileTap={{ scale: 0.98 }} onClick={handleAddNote}
                className="p-2 rounded-lg bg-primary text-primary-foreground">
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComplaintDetail;
