import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { admin } = useAuth();
  if (!admin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
