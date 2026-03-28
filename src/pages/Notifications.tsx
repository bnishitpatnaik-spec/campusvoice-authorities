import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendNotification as sendNotificationApi } from '@/lib/api';
import type { Notification } from '@/types';
import { Send, Bell, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const TARGETS = [
  'All Users',
  'Students Only',
  'Faculty Only',
  'Users with Pending Complaints',
  'Users with Overdue Complaints',
];

const Notifications = () => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [target, setTarget] = useState(TARGETS[0]);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Notification[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    }, () => {
      onSnapshot(collection(db, 'notifications'), (snap) => {
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
      });
    });
    return () => unsub();
  }, []);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Please fill in title and message.');
      return;
    }
    setSending(true);
    try {
      await sendNotificationApi({ title, message, targetAudience: target });
      toast.success('Notification sent!');
      setTitle('');
      setMessage('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to send notification.');
    }
    setSending(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Composer */}
        <div className="card-layer p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Compose Notification
          </h3>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground placeholder:text-muted-foreground resize-none h-28" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Target Audience</label>
            <select value={target} onChange={e => setTarget(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm text-foreground">
              {TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Preview */}
          {(title || message) && (
            <div className="rounded-lg border border-border p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground mb-1">Preview</p>
              <p className="text-sm font-semibold text-foreground">{title || 'Untitled'}</p>
              <p className="text-sm text-muted-foreground mt-1">{message || 'No message'}</p>
              <p className="text-xs text-muted-foreground mt-2">→ {target}</p>
            </div>
          )}

          <motion.button whileTap={{ scale: 0.98 }} onClick={handleSend} disabled={sending}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
            <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send Notification'}
          </motion.button>
        </div>

        {/* History */}
        <div className="card-layer overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" /> Notification History
            </h3>
          </div>
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {history.map(n => (
              <div key={n.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  </div>
                  <span className="status-badge bg-status-resolved/10 text-status-resolved">{n.status}</span>
                </div>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>→ {n.target || (n as any).targetAudience}</span>
                  <span>{n.sentAt?.toDate?.()?.toLocaleString() || (n as any).createdAt?.toDate?.()?.toLocaleString() || 'N/A'}</span>
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-muted-foreground">No notifications sent yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
