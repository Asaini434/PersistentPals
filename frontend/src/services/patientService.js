import { apiRequest } from './api';

export const patientService = {
  getPatientLogs: async (providerId) => {
    const query = providerId ? `?providerId=${encodeURIComponent(providerId)}` : '';
    return apiRequest(`/logs/patient-list${query}`, { method: 'GET' });
  },

  getPatientById: async (id) => {
    return apiRequest(`/patients/${id}`, { method: 'GET' });
  },
};
