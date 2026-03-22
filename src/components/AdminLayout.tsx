import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  BarChart3, ClipboardList, Users, Bell, LogOut, Menu, X, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { label: 'Complaints', path: '/complaints', icon: ClipboardList },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Users', path: '/users', icon: Users },
  { label: 'Notifications', path: '/notifications', icon: Bell },
];

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const { admin, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = admin?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'A';
  const currentPage = navItems.find(n => location.pathname.startsWith(n.path))?.label || 'Complaints';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        flex flex-col bg-sidebar text-sidebar-foreground
        transition-all duration-300 ease-in-out
        ${sidebarOpen ? 'w-64' : 'w-20'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
            <img src="/cv img2.png" alt="CampusVoice" className="w-full h-full object-cover" />
          </div>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-sidebar-foreground truncate">CampusVoice</h1>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">Admin Control Center</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map(item => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150
                  ${active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-1'
                  }
                `}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Admin info + logout */}
        <div className="p-4 border-t border-sidebar-border">
          {sidebarOpen && (
            <div className="mb-3">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{admin?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">{admin?.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top navbar */}
        <header className="h-16 flex items-center justify-between px-6 bg-card border-b border-border flex-shrink-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => {
              if (window.innerWidth < 1024) setMobileOpen(!mobileOpen);
              else setSidebarOpen(!sidebarOpen);
            }} className="p-2 rounded-lg hover:bg-muted transition-colors">
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <h2 className="text-lg font-semibold text-foreground">{currentPage}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent text-sm outline-none w-48 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <Link to="/notifications" className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            </Link>
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
              {initials}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
