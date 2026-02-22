import axios from 'axios';

const api = axios.create();

let getAccessTokenFn = null;

export function setAccessTokenGetter(fn) {
  getAccessTokenFn = fn;
}

function isDemoMode() {
  return localStorage.getItem('healthguard_demo_mode') === 'true';
}

export async function getAuthToken() {
  if (isDemoMode() || !getAccessTokenFn) return null;
  try {
    return await getAccessTokenFn();
  } catch {
    return null;
  }
}

api.interceptors.request.use(async (config) => {
  if (isDemoMode() || !getAccessTokenFn) return config;
  try {
    const token = await getAccessTokenFn();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Send request without auth if token retrieval fails
  }
  return config;
});

export default api;
