import { apiRequest } from './api';

export const authService = {
  login: async (credentials) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  getCurrentUser: async () => {
    return apiRequest('/auth/me', { method: 'GET' });
  },
};
