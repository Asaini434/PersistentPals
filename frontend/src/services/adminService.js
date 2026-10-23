import { apiRequest } from './api';

export const adminService = {
  getProviders: async () => {
    return apiRequest('/admin/providers', { method: 'GET' });
  },

  getProviderById: async (id) => {
    return apiRequest(`/admin/providers/${id}`, { method: 'GET' });
  },

  // One day of a provider's work: therapy sessions, notes written, time per client.
  // date is YYYY-MM-DD; tz is an IANA zone name such as America/New_York.
  getProviderActivity: async (id, { date, tz } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (tz) params.set('tz', tz);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/admin/providers/${id}/activity${query}`, { method: 'GET' });
  },
};