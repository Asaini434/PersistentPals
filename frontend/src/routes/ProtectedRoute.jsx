import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Role-Based Protected Route Guard
 * Enforces authentication and checks whether the active user role is authorized.
 */
export default function ProtectedRoute({ allowedRoles = [] }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user?.role)) {
    // Redirect to the user's appropriate chain if role mismatch occurs
    if (user?.role === 'admin') {
      return <Navigate to="/admin/providers" replace />;
    }
    if (user?.role === 'provider') {
      return <Navigate to="/logs/patient-list" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
