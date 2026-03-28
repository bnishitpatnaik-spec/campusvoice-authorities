import { useState, useEffect } from 'react';
import { useAuth, type Admin } from '@/context/AuthContext';
import { Lock } from 'lucide-react';
import { motion } from 'framer-motion';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'https://campusvoice-backend-4ct0.onrender.com'

const CREDENTIALS: { email: string; password: string; admin: Admin }[] = [
  {
    email: 'admin@campusvoice.com',
    password: 'admin123',
    admin: {
      id: 'admin_001',
      name: 'Campus Authority',
      email: 'admin@campusvoice.com',
      role: 'authority',
      department: 'Administration',
      institute: 'SRM Institute of Science and Technology',
    },
  },
  {
    email: 'authority@srm.edu',
    password: 'authority123',
    admin: {
      id: 'admin_002',
      name: 'SRM Authority',
      email: 'authority@srm.edu',
      role: 'authority',
      department: 'Administration',
      institute: 'SRM Institute of Science and Technology',
    },
  },
];

const Login = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'awake' | 'sleeping'>('checking');

  // Ping backend on mount to wake it up
  useEffect(() => {
    const wake = async () => {
      try {
        const r = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(8000) });
        setServerStatus(r.ok ? 'awake' : 'sleeping');
      } catch {
        setServerStatus('sleeping');
        // Retry after 10s
        setTimeout(wake, 10000);
      }
    };
    wake();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const defaultAdmin = CREDENTIALS[0];
    login({ ...defaultAdmin.admin, email: defaultAdmin.email });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)',
        backgroundSize: '24px 24px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Server wakeup banner */}
        {serverStatus === 'sleeping' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 px-4 py-3 rounded-lg text-sm text-center"
            style={{ background: '#FEF3C7', border: '1px solid #F59E0B', color: '#92400E' }}
          >
            ⏳ Waking up server... This may take 30–50 seconds on first load.
          </motion.div>
        )}
        {serverStatus === 'awake' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-4 px-4 py-2 rounded-lg text-sm text-center"
            style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#065F46' }}
          >
            ✅ Server is ready
          </motion.div>
        )}

        <div className="card-layer p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4">
              <img src="/logo.png" alt="CampusVoice" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">CampusVoice</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Official Control Center
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <motion.button
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading || serverStatus === 'checking'}
              className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Signing in...' : serverStatus === 'checking' ? 'Connecting...' : 'Login to Control Center'}
            </motion.button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Authorized personnel only. All actions are logged.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
