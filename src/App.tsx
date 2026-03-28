import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "@/components/AdminLayout";
import Login from "./pages/Login";
import Complaints from "./pages/Complaints";
import ComplaintDetail from "./pages/ComplaintDetail";
import Analytics from "./pages/Analytics";
import UsersPage from "./pages/Users";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import { useEffect } from "react";

const queryClient = new QueryClient();

// Register service worker for PWA
function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js')
        .then((reg) => console.log('✅ SW registered:', reg.scope))
        .catch((err) => console.warn('SW registration failed:', err));
    });
  }
}

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AdminLayout>{children}</AdminLayout>
  </ProtectedRoute>
);

const App = () => {
  useEffect(() => { registerSW(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/analytics" element={<ProtectedLayout><Analytics /></ProtectedLayout>} />
              <Route path="/complaints" element={<ProtectedLayout><Complaints /></ProtectedLayout>} />
              <Route path="/complaint/:id" element={<ProtectedLayout><ComplaintDetail /></ProtectedLayout>} />
              <Route path="/users" element={<ProtectedLayout><UsersPage /></ProtectedLayout>} />
              <Route path="/notifications" element={<ProtectedLayout><Notifications /></ProtectedLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
