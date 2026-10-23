import { apiRequest } from './api';

export const adminService = {
  getProviders: async () => {
    return apiRequest('/admin/providers', { method: 'GET' });
  },

  getProviderById: async (id) => {
    return apiRequest(`/admin/providers/${id}`, { method: 'GET' });
  },
};
