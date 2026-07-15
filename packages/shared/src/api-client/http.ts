export interface HttpClientOptions {
  baseUrl: string;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  /** Performs the refresh handshake and returns the new access token, or null if refresh failed. */
  refreshAccessToken: () => Promise<string | null>;
  /** web: relies on httpOnly cookie automatically; mobile: must send credentials manually. */
  credentials?: RequestCredentials;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Auth endpoints must never trigger the 401->refresh->retry interceptor below: a 401 from
// /auth/login is just "wrong password", and a 401 from /auth/refresh means refreshing itself
// failed — retrying either by calling refresh again would recurse forever (refresh() calls
// request('/auth/refresh'), which on 401 would call refreshAccessToken(), which calls
// refresh() again, deadlocking on its own in-flight promise).
const NO_RETRY_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/quick-unlock/pin', '/auth/quick-unlock/biometric'];

export function createHttpClient(opts: HttpClientOptions) {
  let refreshInFlight: Promise<string | null> | null = null;

  async function request<T>(
    path: string,
    init: RequestInit = {},
    _retried = false
  ): Promise<T> {
    const token = opts.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${opts.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: opts.credentials ?? 'include',
    });

    if (res.status === 401 && !_retried && !NO_RETRY_PATHS.includes(path)) {
      if (!refreshInFlight) {
        refreshInFlight = opts.refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }
      const newToken = await refreshInFlight;
      if (newToken) {
        opts.setAccessToken(newToken);
        return request<T>(path, init, true);
      }
    }

    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* no json body */
      }
      const message =
        (body as { message?: string } | null)?.message || `Request failed: ${res.status}`;
      throw new ApiError(res.status, message, body);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;
