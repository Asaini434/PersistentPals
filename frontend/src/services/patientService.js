import { apiRequest } from './api';

export const patientService = {
  getPatientLogs: async (providerId) => {
    const query = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
    return apiRequest(`/logs/patient-list${query}`, { method: 'GET' });
  },

  getPatientById: async (id) => {
    return apiRequest(`/patients/${id}`, { method: 'GET' });
  },

  // How one client uses the Reflect apps (modules, time of day, trend, mood). days: 7 to 90.
  getActivity: async (id, { days = 30, tz } = {}) => {
    const params = new URLSearchParams({ days: String(days) });
    if (tz) params.set('tz', tz);
    return apiRequest(`/patients/${id}/activity?${params.toString()}`, { method: 'GET' });
  },

  // Add a provider note. Pass clinical_session_id to attach it to a therapy session.
  addNote: async (id, { content, clinical_session_id }) => {
    return apiRequest(`/patients/${id}/notes`, {
      method: 'POST',
      body: JSON.stringify({ content, clinical_session_id: clinical_session_id || null }),
    });
  },

  // Log an async provider/client exchange (email, text, phone, portal, other).
  addCommunication: async (id, { direction, channel, minutes, summary }) => {
    return apiRequest(`/patients/${id}/communications`, {
      method: 'POST',
      body: JSON.stringify({ direction, channel, minutes: Number(minutes) || 0, summary }),
    });
  },
};