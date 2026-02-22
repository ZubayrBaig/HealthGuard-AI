import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const location = useLocation();

  return (
    <div key={location.pathname} className="animate-page-in h-full">
      {children}
    </div>
  );
}
