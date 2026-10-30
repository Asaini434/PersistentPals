import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import AuthLayout from '../components/layout/AuthLayout';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import Home from '../pages/home/Home';
import PatientList from '../pages/logs/PatientList';
import PatientDetail from '../pages/patients/PatientDetail';
import MyProfile from '../pages/providers/MyProfile';
import AdminProviderList from '../pages/admin/AdminProviderList';
import AdminProviderDetail from '../pages/admin/AdminProviderDetail';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../context/AuthContext';

function RootRedirect() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/home" replace />;
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

        {/* Home: map of the dashboard + readiness report, for any signed-in role */}
        <Route element={<ProtectedRoute allowedRoles={['provider', 'admin']} />}>
          <Route path="home" element={<Home />} />
        </Route>

        {/* Provider Chain: Exclusively accessible to Provider credentials */}
        <Route element={<ProtectedRoute allowedRoles={['provider']} />}>
          <Route path="logs/patient-list" element={<PatientList />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="patient-detail" element={<Navigate to="/logs/patient-list" replace />} />
          <Route path="providers/me" element={<MyProfile />} />
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