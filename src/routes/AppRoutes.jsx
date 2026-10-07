import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from '../components/layout/MainLayout';
import AuthLayout from '../components/layout/AuthLayout';
import Login from '../pages/auth/Login';
import Signup from '../pages/auth/Signup';
import PatientList from '../pages/logs/PatientList';
import PatientDetail from '../pages/patients/PatientDetail';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      {/* Main Application Routes (wrapped in MainLayout) */}
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/logs/patient-list" replace />} />
        <Route path="logs/patient-list" element={<PatientList />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="patient-detail" element={<PatientDetail />} />
      </Route>

      {/* Fallback Route */}
      <Route path="*" element={<Navigate to="/logs/patient-list" replace />} />
    </Routes>
  );
}
