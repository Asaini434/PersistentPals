import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Account Provisioning Notice
 * ReflectX accounts are provisioned by a practice administrator from seeded
 * clinician/admin records (database/seed.sql) — there is no self-service
 * signup endpoint on the backend.
 */
export default function Signup() {
  return (
    <div className="auth-card-wrapper">
      <div className="auth-page">
        <div className="auth-header">
          <h2>Account Access</h2>
          <p className="subtitle" style={{ textAlign: 'center', marginBottom: '20px' }}>
            ReflectX accounts are provisioned by your practice administrator, not created
            through self-service signup.
          </p>
        </div>

        <div className="credentials-helper-card">
          <div className="helper-header">
            <span>Need access?</span>
          </div>
          <div className="helper-body">
            <p style={{ margin: 0 }}>
              Ask a practice administrator to add your clinician or admin account to the
              database. Once provisioned, sign in with your username or email and password.
            </p>
          </div>
        </div>

        <Link to="/login" className="btn-primary" style={{ width: '100%', textAlign: 'center', display: 'block', marginTop: '16px' }}>
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
