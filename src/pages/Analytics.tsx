import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Complaint } from '@/types';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import {
  TrendingUp, Clock, Activity, CheckCircle, XCircle, AlertTriangle, Eye, Star,
} from 'lucide-react';

const STATUS_COLORS = ['#F59E0B', '#3B82F6', '#10B981', '#EF4444'];
const CAT_COLORS = ['#7C3AED', '#EF4444', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#6B7280'];
const DEPT_MAP: Record<string, string> = {
  Infrastructure: 'Facilities', Safety: 'Security', Technology: 'IT Services',
  Academic: 'Academic', Health: 'Student Services', Hygiene: 'Facilities', Other: 'Student Services',
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`status-badge status-${status}`}>{status.replace('_', ' ')}</span>
);

const Analytics = () => {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setComplaints(snap.docs.map(d => ({ id: d.id, ...d.data() } as Complaint)));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // --- Derived stats ---
  const total = complaints.length;
  const resolved = complaints.filter(c => c.status === 'resolved').length;
  const inProgress = complaints.filter(c => c.status === 'in_progress').length;
  const pending = complaints.filter(c => c.status === 'pending').length;
  const rejected = complaints.filter(c => c.status === 'rejected').length;
  const overdueList = complaints.filter(c => {
    if (c.status === 'resolved' || c.status === 'rejected') return false;
    const d = c.deadline?.toDate?.() || (c.deadline ? new Date(c.deadline) : null);
    return d && d < new Date();
  });
  const overdue = overdueList.length;
  const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  const resolvedComplaints = complaints.filter(c => c.status === 'resolved' && c.daysToResolve != null);
  const avgResolutionTime = resolvedComplaints.length > 0
    ? Math.round(resolvedComplaints.reduce((s, c) => s + (c.daysToResolve || 0), 0) / resolvedComplaints.length)
    : 0;

  const ratedComplaints = complaints.filter(c => c.satisfactionRating != null);
  const avgSatisfaction = ratedComplaints.length > 0
    ? (ratedComplaints.reduce((s, c) => s + (c.satisfactionRating || 0), 0) / ratedComplaints.length).toFixed(1)
    : null;

  const endorsedCount = complaints.filter(c => c.isEndorsed || c.facultyEndorsed).length;

  const kpis = [
    { label: 'Total Complaints', value: total, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'Pending', value: pending, icon: Clock, color: 'text-status-pending', bg: 'bg-status-pending/10' },
    { label: 'In Progress', value: inProgress, icon: Activity, color: 'text-status-progress', bg: 'bg-status-progress/10' },
    { label: 'Resolved', value: resolved, icon: CheckCircle, color: 'text-status-resolved', bg: 'bg-status-resolved/10' },
    { label: 'Rejected', value: rejected, icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Overdue', value: overdue, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
    { label: 'Faculty Endorsed', value: endorsedCount, icon: Star, color: 'text-amber-500', bg: 'bg-amber-100' },
  ];

  // Weekly trends
  const weeklyData = Array.from({ length: 6 }, (_, i) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (5 - i) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const submitted = complaints.filter(c => {
      const d = c.createdAt?.toDate?.() || new Date(c.createdAt);
      return d >= weekStart && d < weekEnd;
    }).length;
    const resolvedCnt = complaints.filter(c => {
      if (c.status !== 'resolved') return false;
      const d = c.resolvedAt?.toDate?.() || c.createdAt?.toDate?.() || new Date();
      return d >= weekStart && d < weekEnd;
    }).length;
    return { name: `Week ${i + 1}`, submitted, resolved: resolvedCnt };
  });

  // Status distribution
  const statusData = [
    { name: 'Pending', value: pending },
    { name: 'In Progress', value: inProgress },
    { name: 'Resolved', value: resolved },
    { name: 'Rejected', value: rejected },
  ].filter(d => d.value > 0);

  // Category distribution
  const catMap: Record<string, number> = {};
  complaints.forEach(c => { catMap[c.category || 'Other'] = (catMap[c.category || 'Other'] || 0) + 1; });
  const categoryData = Object.entries(catMap).map(([name, value]) => ({ name, value }));

  // Department performance
  const depts = ['Security', 'IT Services', 'Facilities', 'Academic', 'Student Services'];
  const departmentData = depts.map(dept => {
    const deptComplaints = complaints.filter(c => DEPT_MAP[c.category || 'Other'] === dept);
    return {
      name: dept,
      resolved: deptComplaints.filter(c => c.status === 'resolved').length,
      pending: deptComplaints.filter(c => c.status !== 'resolved').length,
    };
  });

  // Recent 5
  const recent = complaints.slice(0, 5);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {[1,2,3,4,5,6,7].map(i => <div key={i} className="shimmer h-28 rounded-lg" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="shimmer h-72 rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* SECTION 1 — KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {kpis.map(k => (
          <div key={k.label} className="kpi-card flex-col items-start gap-2">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center`}>
              <k.icon className={`w-5 h-5 ${k.color}`} />
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* SECTION 2 & 3 — Weekly Trends + Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-layer p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Weekly Trends</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Line type="monotone" dataKey="submitted" stroke="#7C3AED" strokeWidth={2.5} dot={false} name="Submitted" />
              <Line type="monotone" dataKey="resolved" stroke="#10B981" strokeWidth={2.5} dot={false} name="Resolved" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-0.5 bg-[#7C3AED] rounded" /> Submitted
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-3 h-0.5 bg-[#10B981] rounded" /> Resolved
            </div>
          </div>
        </div>

        <div className="card-layer p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                {statusData.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 4 & 5 — Category + Department */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-layer p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Category Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Complaints">
                {categoryData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card-layer p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Department Performance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={departmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip />
              <Legend />
              <Bar dataKey="resolved" fill="#10B981" radius={[4, 4, 0, 0]} name="Resolved" />
              <Bar dataKey="pending" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Pending" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SECTION 6 — Resolution Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-layer p-6 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Resolution Rate</p>
          <p className="text-3xl font-bold text-foreground tabular-nums">{resolutionRate}%</p>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-1">
            <div className="h-full bg-status-resolved rounded-full transition-all duration-500" style={{ width: `${resolutionRate}%` }} />
          </div>
        </div>
        <div className="card-layer p-6 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Avg. Resolution Time</p>
          <p className="text-3xl font-bold text-foreground tabular-nums">{avgResolutionTime} <span className="text-base font-normal text-muted-foreground">days</span></p>
          <p className="text-xs text-muted-foreground">across {resolvedComplaints.length} resolved complaints</p>
        </div>
        <div className="card-layer p-6 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Resolved vs Total</p>
          <p className="text-3xl font-bold text-foreground tabular-nums">{resolved} <span className="text-base font-normal text-muted-foreground">/ {total}</span></p>
          <p className="text-xs text-muted-foreground">{total - resolved} still open</p>
        </div>
        <div className="card-layer p-6 flex flex-col gap-2" style={{ background: avgSatisfaction ? '#FFFBEB' : undefined, border: avgSatisfaction ? '1px solid #FCD34D' : undefined }}>
          <p className="text-xs text-muted-foreground">Avg. Satisfaction</p>
          {avgSatisfaction ? (
            <>
              <p className="text-3xl font-bold tabular-nums" style={{ color: '#92400E' }}>{avgSatisfaction} <span className="text-base font-normal">/ 5 ⭐</span></p>
              <p className="text-xs text-muted-foreground">from {ratedComplaints.length} ratings</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* SECTION 7 — Recent Complaints */}
      <div className="card-layer overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Recent Complaints</h3>
          <Link to="/complaints" className="text-xs text-primary font-medium hover:underline">View All</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                <th className="px-6 py-3">Title</th>
                <th className="px-6 py-3">Category</th>
                <th className="px-6 py-3">Submitted By</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-muted/20' : ''}>
                  <td className="px-6 py-3 font-medium text-foreground truncate max-w-[180px]">{c.title}</td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">{c.category}</td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">{c.userName}</td>
                  <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">
                    {c.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'}
                  </td>
                  <td className="px-6 py-3">
                    <Link to={`/complaint/${c.id}`} className="inline-flex items-center gap-1 text-primary text-xs font-medium hover:underline">
                      <Eye className="w-3.5 h-3.5" /> View
                    </Link>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No complaints yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 8 — Overdue Complaints */}
      {overdueList.length > 0 && (
        <div className="rounded-lg border-l-4 border-destructive bg-destructive/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Overdue Complaints ({overdueList.length})</h3>
          </div>
          <div className="space-y-2">
            {overdueList.slice(0, 5).map(c => {
              const deadline = c.deadline?.toDate?.() || new Date(c.deadline);
              const daysOver = Math.floor((Date.now() - deadline.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <Link key={c.id} to={`/complaint/${c.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-destructive/10 transition-colors">
                  <span className="text-sm text-foreground font-medium">{c.title}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-destructive font-bold">{daysOver}d overdue</span>
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-medium">
                      <Eye className="w-3 h-3" /> View
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
