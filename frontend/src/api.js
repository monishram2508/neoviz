const configured = process.env.REACT_APP_API_URL;

export const API_BASE = (configured || "/api").replace(/\/+$/, "");

export const apiUrl = (path) => `${API_BASE}/${String(path).replace(/^\/+/, "")}`;

export const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function apiFetch(path, options = {}) {
  const { auth = true, headers = {}, ...rest } = options;
  return fetch(apiUrl(path), {
    ...rest,
    headers: {
      ...(auth ? authHeaders() : {}),
      ...headers
    }
  });
}

export async function apiJson(path, options = {}) {
  const { body, method = body ? "POST" : "GET", ...rest } = options;
  const res = await apiFetch(path, {
    ...rest,
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(rest.headers || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}
