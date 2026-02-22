import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { HeartPulse } from 'lucide-react';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <HeartPulse className="h-10 w-10 text-blue-500 animate-pulse" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
