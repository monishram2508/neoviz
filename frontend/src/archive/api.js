import { apiUrl } from "../api";

async function get(path, params) {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${apiUrl(`public/${path}`)}${qs}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const getMeta = () => get("meta");
export const getAuthors = () => get("authors");
export const getAuthor = (slug) => get(`authors/${encodeURIComponent(slug)}`);
export const getWork = (slug) => get(`works/${encodeURIComponent(slug)}`);

export const getWorks = ({ keywords = [], mode = "all", limit = 60, offset = 0 } = {}) =>
  get("works", { kw: keywords.join(","), mode, limit, offset });

export const getGraph = ({ keywords = [], mode = "all" } = {}) =>
  get("graph", { kw: keywords.join(","), mode });
