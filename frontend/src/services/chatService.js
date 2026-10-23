import { apiRequest } from './api';

export const chatService = {
  getMessages: () => apiRequest('/chat/messages'),
  sendMessage: (message) =>
    apiRequest('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  clearMessages: () =>
    apiRequest('/chat/messages', {
      method: 'DELETE',
    }),
};
