const API_BASE = "/api";
const AUTH_KEY_STORAGE = "vibego_auth_key";

export function getAuthHeaders(): Record<string, string> {
  const key = localStorage.getItem(AUTH_KEY_STORAGE);
  if (key) {
    return { Authorization: `Bearer ${key}` };
  }
  return {};
}

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

export { API_BASE };
