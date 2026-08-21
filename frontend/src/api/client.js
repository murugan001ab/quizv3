// Minimal axios-like client (get/post/put/delete -> { data }) backed by fetch.
// Attaches the auth token from localStorage automatically, mirroring how
// AuthContext stores it after login.

const BASE = import.meta.env.VITE_API_URL || "";

async function request(method, path, { data, params } = {}) {
  let url = BASE + path;

  if (params && Object.keys(params).length) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  let body = null;
  if (res.status !== 204) {
    body = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const err = new Error(body?.detail || "Request failed");
    err.response = { status: res.status, data: body };
    throw err;
  }

  return { data: body };
}

const api = {
  get: (path, config) => request("GET", path, config),
  post: (path, data, config) => request("POST", path, { ...config, data }),
  put: (path, data, config) => request("PUT", path, { ...config, data }),
  delete: (path, config) => request("DELETE", path, config),
};

export default api;
