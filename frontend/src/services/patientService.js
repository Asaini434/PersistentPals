import { apiRequest } from './api';

export const patientService = {
  getPatientLogs: async (params = {}) => {
    return apiRequest('/logs/patient-list', { method: 'GET' });
  },

  getPatientById: async (id) => {
    return apiRequest(`/patients/${id}`, { method: 'GET' });
  },

  createPatient: async (data) => {
    return apiRequest('/patients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
