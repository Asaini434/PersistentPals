import { apiRequest } from './api';

export const providerService = {
  getProfile: async (providerId) => {
    return apiRequest(`/providers?providerId=${encodeURIComponent(providerId)}`, { method: 'GET' });
  },

  getPatients: async (providerId) => {
    return apiRequest(`/providers/${providerId}/patients`, { method: 'GET' });
  },

  // How the provider's clients use the apps: modules, time of day, trend, who has gone quiet.
  getEngagement: async (providerId, { days = 30, tz } = {}) => {
    const params = new URLSearchParams({ days: String(days) });
    if (tz) params.set('tz', tz);
    return apiRequest(`/providers/${providerId}/engagement?${params.toString()}`, { method: 'GET' });
  },

  // The provider's own time log: { period: last 30 days, day: the chosen date }.
  getActivity: async (providerId, { date, tz } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (tz) params.set('tz', tz);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest(`/providers/${providerId}/activity${query}`, { method: 'GET' });
  },
};