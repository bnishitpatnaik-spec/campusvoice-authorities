import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUser } from '@/types';
import { Search, Users as UsersIcon, GraduationCap, Award, ChevronLeft, ChevronRight } from 'lucide-react';

const PER_PAGE = 10;

const UsersPage = () => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [complaintCounts, setComplaintCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'student' | 'faculty'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, async (snap) => {
      const fetchedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
      setUsers(fetchedUsers);
      const counts: Record<string, number> = {};
      await Promise.all(
        fetchedUsers.map(async (u) => {
          if (!u.email) return;
          const complaintsSnap = await getDocs(
            query(collection(db, 'complaints'), where('submittedBy', '==', u.email))
          );
          counts[u.email] = complaintsSnap.size;
        })
      );
      setComplaintCounts(counts);
      setLoading(false);
    }, () => {
      // fallback without orderBy
      onSnapshot(collection(db, 'users'), async (snap) => {
        const fetchedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppUser));
        setUsers(fetchedUsers);
        setLoading(false);
      }, () => setLoading(false));
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    let result = [...users];
    if (tab !== 'all') result = result.filter(u => u.role?.toLowerCase() === tab);
    if (searchQuery) result = result.filter(u =>
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return result;
  }, [users, tab, searchQuery]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const students = users.filter(u => u.role?.toLowerCase() === 'student').length;
  const faculty = users.filter(u => u.role?.toLowerCase() === 'faculty').length;
  const topContributor = [...users].sort((a, b) => (b.points || 0) - (a.points || 0))[0];

  const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
  const getColor = (name: string) => {
    const colors = ['bg-primary', 'bg-status-progress', 'bg-status-resolved', 'bg-status-pending', 'bg-destructive'];
    const idx = (name || '').charCodeAt(0) % colors.length;
    return colors[idx];
  };

  const tabs = [
    { key: 'all' as const, label: 'All Users' },
    { key: 'student' as const, label: 'Students' },
    { key: 'faculty' as const, label: 'Faculty' },
  ];

  if (loading) {
    return <div className="space-y-3">{Array.from({length:6}).map((_,i) => <div key={i} className="shimmer h-14 rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div>
            <p className="text-sm text-muted-foreground">Total Users</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{users.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><UsersIcon className="w-5 h-5 text-primary" /></div>
        </div>
        <div className="kpi-card">
          <div>
            <p className="text-sm text-muted-foreground">Students</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{students}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-status-progress/10 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-status-progress" /></div>
        </div>
        <div className="kpi-card">
          <div>
            <p className="text-sm text-muted-foreground">Faculty</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{faculty}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-status-pending/10 flex items-center justify-center"><UsersIcon className="w-5 h-5 text-status-pending" /></div>
        </div>
        <div className="kpi-card">
          <div>
            <p className="text-sm text-muted-foreground">Top Contributor</p>
            <p className="text-sm font-bold text-foreground truncate">{topContributor?.name || 'N/A'}</p>
            <p className="text-xs text-muted-foreground">{topContributor?.points || 0} pts</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-status-resolved/10 flex items-center justify-center"><Award className="w-5 h-5 text-status-resolved" /></div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="card-layer p-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setPage(1); }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Search users..." value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground" />
        </div>
      </div>

      {/* Table */}
      <div className="card-layer overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Institute</th>
                <th className="px-4 py-3">Points</th>
                <th className="px-4 py-3">Complaints</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? 'bg-muted/20' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${getColor(u.name)} flex items-center justify-center text-xs font-bold text-primary-foreground`}>
                        {getInitials(u.name)}
                      </div>
                      <span className="font-medium text-foreground">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`status-badge ${u.role?.toLowerCase() === 'faculty' ? 'bg-primary/10 text-primary' : 'bg-status-progress/10 text-status-progress'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{u.institute || 'N/A'}</td>
                  <td className="px-4 py-3 font-semibold text-foreground tabular-nums">{(u as any).points ?? 0}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{u.email ? (complaintCounts[u.email] ?? 0) : 0}</td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Showing {Math.min((page-1)*PER_PAGE+1, filtered.length)}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-foreground font-medium">{page}/{totalPages||1}</span>
          <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page>=totalPages} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};

export default UsersPage;
