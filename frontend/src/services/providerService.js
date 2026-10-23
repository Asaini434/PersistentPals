import { apiRequest } from './api';

export const providerService = {
  getProfile: async (providerId) => {
    return apiRequest(`/providers?providerId=${encodeURIComponent(providerId)}`, { method: 'GET' });
  },

  getPatients: async (providerId) => {
    return apiRequest(`/providers/${providerId}/patients`, { method: 'GET' });
  },
};
