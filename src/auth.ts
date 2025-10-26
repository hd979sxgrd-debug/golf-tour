export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'belek2025!';
const ADMIN_AUTH_STORAGE_KEY = 'adminAuth';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function storeAdminAuthToken(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const token = window.btoa(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`);
    storage.setItem(ADMIN_AUTH_STORAGE_KEY, token);
  } catch {
    // ignore storage errors
  }
}

export function clearAdminAuthToken(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getAdminAuthToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    return storage.getItem(ADMIN_AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}
