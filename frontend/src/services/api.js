/**
 * Base API Configuration & Request Handler
 */
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function apiRequest(endpoint, options = {}) {
  let token;
  try {
    const session = JSON.parse(sessionStorage.getItem('reflectx_auth_session') || 'null');
    token = session?.access_token;
  } catch {
    token = undefined;
  }

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || result.error || `API Error: ${response.statusText}`);
    }
    return result;
  } catch (error) {
    console.error('API Request Failed:', error);
    throw error;
  }
}
