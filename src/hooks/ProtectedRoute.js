import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, role, authReady } = useAuth();

  if (!authReady) {
    return <div className="text-center mt-5">Checking authentication...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const permittedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  if (requiredRole && (!role || !permittedRoles.includes(role))) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default ProtectedRoute;
