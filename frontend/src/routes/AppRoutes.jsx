import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import AuthLayout from '../components/layout/AuthLayout';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import PatientList from '../pages/logs/PatientList';
import PatientDetail from '../pages/patients/PatientDetail';
import AdminProviderList from '../pages/admin/AdminProviderList';
import AdminProviderDetail from '../pages/admin/AdminProviderDetail';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

function RootRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return user?.role === 'admin' ? (
    <Navigate to="/admin/providers" replace />
  ) : (
    <Navigate to="/logs/patient-list" replace />
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      {/* Main Application Layout */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<RootRedirect />} />

        {/* Provider Chain: Exclusively accessible to Provider credentials */}
        <Route element={<ProtectedRoute allowedRoles={['provider']} />}>
          <Route path="logs/patient-list" element={<PatientList />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="patient-detail" element={<Navigate to="/patients/PT-1001" replace />} />
        </Route>

        {/* Admin Chain: Exclusively accessible to Admin credentials */}
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="admin" element={<Navigate to="/admin/providers" replace />} />
          <Route path="admin/providers" element={<AdminProviderList />} />
          <Route path="admin/providers/:id" element={<AdminProviderDetail />} />
        </Route>
      </Route>

      {/* Fallback Route */}
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
