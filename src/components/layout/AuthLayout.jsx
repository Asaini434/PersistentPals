import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../common/Header';

export default function AuthLayout() {
  return (
    <div className="layout-wrapper auth-wrapper">
      <Header />
      <main className="auth-container">
        <Outlet />
      </main>
    </div>
  );
}
