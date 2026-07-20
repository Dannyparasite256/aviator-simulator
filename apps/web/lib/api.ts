const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refreshToken');
}

export function setTokens(tokens: { accessToken: string; refreshToken: string }) {
  localStorage.setItem('accessToken', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

function extractMessage(data: unknown, fallback: string): string {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const msg = (data as { message: unknown }).message;
    if (Array.isArray(msg)) return msg.map(String).join(', ');
    if (typeof msg === 'string') return msg;
    if (msg != null) return String(msg);
  }
  return fallback;
}

let refreshInFlight: Promise<string | null> | null = null;

/** Try to refresh access token once; returns new access token or null. */
export async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          clearTokens();
          return null;
        }
        const data = (await res.json()) as {
          tokens: { accessToken: string; refreshToken: string };
        };
        setTokens(data.tokens);
        return data.tokens.accessToken;
      } catch {
        clearTokens();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

export async function api<T>(
  path: string,
  options: RequestInit & { auth?: boolean; skipRefresh?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new ApiError(
      `Cannot reach the server at ${API_URL}. Check that the API is running.`,
      0,
    );
  }

  // Silent refresh once on expired access token
  if (
    res.status === 401 &&
    options.auth !== false &&
    !options.skipRefresh &&
    path !== '/auth/login' &&
    path !== '/auth/register' &&
    path !== '/auth/refresh'
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      try {
        res = await fetch(`${API_URL}/api${path}`, {
          ...options,
          headers,
        });
      } catch {
        throw new ApiError(
          `Cannot reach the server at ${API_URL}. Check that the API is running.`,
          0,
        );
      }
    }
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    throw new ApiError(extractMessage(data, res.statusText || 'Request failed'), res.status, data);
  }

  return data as T;
}

export { API_URL };
