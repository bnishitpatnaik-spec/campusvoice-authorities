import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { updateComplaintStatus } from '@/lib/api';
import type { Complaint } from '@/types';
import { Search, Eye, AlertTriangle, Star, MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const STATUSES = ['all', 'pending', 'in_progress', 'resolved', 'rejected', 'endorsed'] as const;
const CATEGORIES = ['All', 'Infrastructure', 'Safety', 'Technology', 'Academic', 'Health', 'Hygiene', 'Other'];
const PER_PAGE = 10;

const Complaints = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setComplaints(snap.docs.map(d => {
        const data = d.data();
        const upvoteCount = typeof data.upvoteCount === 'number'
          ? data.upvoteCount
          : (Array.isArray(data.upvotes) ? data.upvotes.length : 0);
        return { id: d.id, ...data, upvoteCount } as Complaint;
      }));
      setLoading(false);
    }, (error) => {
      console.error('Firestore error:', error.code, error.message);
      // If index missing or permission denied, try without orderBy
      const fallbackQ = collection(db, 'complaints');
      onSnapshot(fallbackQ, (snap) => {
        const docs = snap.docs.map(d => {
          const data = d.data();
          const upvoteCount = typeof data.upvoteCount === 'number'
            ? data.upvoteCount
            : (Array.isArray(data.upvotes) ? data.upvotes.length : 0);
          return { id: d.id, ...data, upvoteCount } as Complaint;
        });
        docs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setComplaints(docs);
        setLoading(false);
      }, (err2) => {
        console.error('Fallback Firestore error:', err2.code, err2.message);
        setLoading(false);
      });
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let result = [...complaints];
    if (searchQuery) result = result.filter(c => c.title?.toLowerCase().includes(searchQuery.toLowerCase()));
    if (statusFilter === 'endorsed') {
      result = result.filter(c => c.isEndorsed === true || c.facultyEndorsed === true);
    } else if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }
    if (categoryFilter !== 'All') result = result.filter(c => c.category === categoryFilter);
    if (sortBy === 'oldest') result.reverse();
    else if (sortBy === 'upvotes') result.sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0));
    else if (sortBy === 'overdue') result.sort((a, b) => {
      const da = a.deadline?.toDate?.() || new Date(a.deadline || '2099-01-01');
      const db2 = b.deadline?.toDate?.() || new Date(b.deadline || '2099-01-01');
      return da.getTime() - db2.getTime();
    });
    else {
      // Default: endorsed first → overdue → upvotes → newest
      result.sort((a: Complaint, b: Complaint) => {
        const aEndorsed = a.isEndorsed || a.facultyEndorsed;
        const bEndorsed = b.isEndorsed || b.facultyEndorsed;
        if (aEndorsed && !bEndorsed) return -1;
        if (!aEndorsed && bEndorsed) return 1;
        const now = Date.now();
        const aDeadline = a.deadline?.toDate?.() || (a.deadline ? new Date(a.deadline) : null);
        const bDeadline = b.deadline?.toDate?.() || (b.deadline ? new Date(b.deadline) : null);
        const aOverdue = aDeadline && aDeadline.getTime() < now && a.status !== 'resolved' && a.status !== 'rejected';
        const bOverdue = bDeadline && bDeadline.getTime() < now && b.status !== 'resolved' && b.status !== 'rejected';
        if (aOverdue && !bOverdue) return -1;
        if (!aOverdue && bOverdue) return 1;
        const aUp = typeof a.upvoteCount === 'number' ? a.upvoteCount : (Array.isArray(a.upvotes) ? a.upvotes.length : (a.upvotes || 0));
        const bUp = typeof b.upvoteCount === 'number' ? b.upvoteCount : (Array.isArray(b.upvotes) ? b.upvotes.length : (b.upvotes || 0));
        if (bUp !== aUp) return bUp - aUp;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
    }
    return result;
  }, [complaints, searchQuery, statusFilter, categoryFilter, sortBy]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleAutoReject = async (c: Complaint) => {
    try {
      await updateComplaintStatus(c.id, {
        status: 'rejected',
        rejectionReason: 'Complaint rejected: Location not mentioned. Please resubmit with specific location details.',
      });
      toast.success('Complaint auto-rejected due to missing location.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to reject complaint.');
    }
  };

  const handleQuickStatus = async (id: string, status: string) => {
    try {
      await updateComplaintStatus(id, { status: status as 'in_progress' | 'resolved' | 'rejected' });
      toast.success(`Status updated to ${status.replace('_', ' ')}`);
    } catch (e: any) { toast.error(e.message || 'Failed to update status.'); }
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <span className={`status-badge status-${status}`}>{status.replace('_', ' ')}</span>
  );

  if (loading) {
    return <div className="space-y-3">{Array.from({length:8}).map((_,i) => <div key={i} className="shimmer h-14 rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card-layer p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search complaints..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
              className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground">
            {STATUSES.map(s => (
              <option key={s} value={s}>
                {s === 'all' ? 'All Status' : s === 'endorsed' ? '⭐ Faculty Endorsed' : s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="upvotes">Most Upvotes</option>
            <option value="overdue">Overdue First</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card-layer overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3">Complaint</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Upvotes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((c, i) => {
                const noLocation = !c.location || c.location.trim() === '';
                const isEndorsed = c.isEndorsed || c.facultyEndorsed;
                return (
                  <tr key={c.id} style={{
                    borderLeft: isEndorsed ? '4px solid #F59E0B' : c.status === 'rejected' ? '4px solid transparent' : '4px solid transparent',
                    background: isEndorsed ? '#FFFBEB' : i % 2 === 0 ? 'hsl(var(--muted) / 0.2)' : 'white',
                  }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {c.imageUrl && (
                          <img src={c.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[200px]">
                            {isEndorsed && <Star className="w-3.5 h-3.5 text-amber-500 inline mr-1" />}
                            {c.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{c.description}</p>
                            {isEndorsed && (
                              <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', border: '1px solid #F59E0B', whiteSpace: 'nowrap' }}>
                                ⭐ Faculty Endorsed
                              </span>
                            )}
                            {isEndorsed && (
                              <span style={{ background: '#EF4444', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap' }}>
                                HIGH PRIORITY
                              </span>
                            )}
                            {c.isReRaise && (
                              <span style={{ background: '#FEF2F2', color: '#DC2626', fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', border: '1px solid #FCA5A5', whiteSpace: 'nowrap' }}>
                                🔄 Re-raised
                              </span>
                            )}
                            {c.raisedAgainFrom && (
                              <span style={{ background: '#FFF7ED', color: '#C2410C', fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', border: '1px solid #FDBA74', whiteSpace: 'nowrap' }}>
                                🔁 Raised Again
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground">{c.category}</span>
                    </td>
                    <td className="px-4 py-3">
                      {noLocation ? (
                        <span className="inline-flex items-center gap-1 text-xs text-status-pending font-medium">
                          <AlertTriangle className="w-3 h-3" /> No Location
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {c.location}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.userName && !c.userName.includes('@')
                        ? c.userName
                        : (c.userName || c.submittedBy || '')
                            .split('@')[0]
                            .replace(/[._]/g, ' ')
                            .replace(/\b\w/g, (l: string) => l.toUpperCase()) || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-foreground">
                      {typeof c.upvoteCount === 'number' ? c.upvoteCount : (Array.isArray(c.upvotes) ? c.upvotes.length : (c.upvotes || 0))}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      {c.satisfactionRating ? (
                        <span className="text-xs font-semibold text-amber-600">
                          {'⭐'.repeat(c.satisfactionRating)} {c.satisfactionRating}/5
                        </span>
                      ) : c.status === 'resolved' ? (
                        <span className="text-xs text-muted-foreground">Pending rating</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/complaint/${c.id}`} className="text-primary text-xs font-medium hover:underline inline-flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                        {noLocation && c.status === 'pending' && (
                          <button onClick={() => handleAutoReject(c)} className="text-xs text-destructive font-medium hover:underline">
                            Auto Reject
                          </button>
                        )}
                        {c.status === 'pending' && (
                          <select
                            onChange={e => { if (e.target.value) handleQuickStatus(c.id, e.target.value); e.target.value = ''; }}
                            className="text-xs border border-input rounded px-1 py-0.5 bg-background text-foreground"
                            defaultValue=""
                          >
                            <option value="" disabled>Change</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginated.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No complaints found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {Math.min((page-1)*PER_PAGE+1, filtered.length)}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-foreground font-medium">{page} / {totalPages || 1}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
            className="p-2 rounded-lg hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Complaints;
