import { apiFetch } from "../api";

export async function send(path, { method = "GET", body } = {}) {
  const hasBody = body !== undefined;
  const res = await apiFetch(path, {
    method,
    headers: hasBody ? { "Content-Type": "application/json" } : {},
    body: hasBody ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

const post = (path, body = {}) => send(path, { method: "POST", body });

const query = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
  return search ? `?${search}` : "";
};

const id = (value) => encodeURIComponent(value);

export const register = (body) => post("register", body);
export const login = (body) => post("login", body);
export const getMe = () => send("me");
export const updateMe = (body) => send("me", { method: "PATCH", body });

export const QUEUE_EVENT = "bh:queue-changed";

const announce = (result) => {
  window.dispatchEvent(new Event(QUEUE_EVENT));
  return result;
};

export const submit = (body) => post("submissions", body).then(announce);
export const editSubmission = (sid, payload) =>
send(`submissions/${id(sid)}`, { method: "PATCH", body: payload }).then(announce);
export const withdrawSubmission = (sid) => post(`submissions/${id(sid)}/withdraw`).then(announce);
export const getSubmission = (sid) => send(`submissions/${id(sid)}`);
export const getHistory = (sid) => send(`submissions/${id(sid)}/history`);
export const getQueue = ({ status, type } = {}) => send(`submissions${query({ status, type })}`);
export const getPreview = (sid) => send(`submissions/${id(sid)}/preview`);
export const decide = (sid, { decision, note, keywordOverrides, version }) =>
post(`submissions/${id(sid)}/decide`, { decision, note, keywordOverrides, version }).then(announce);
export const retract = (sid, reason) => post(`submissions/${id(sid)}/retract`, { reason }).then(announce);

export const getPerson = (uid) => send(`public/people/${id(uid)}`);
export const getPersonFull = (uid) => send(`people/${id(uid)}/full`);

export const getUsers = () => send("users");
export const setRole = (uid, role) => post(`users/${id(uid)}/role`, { role });
export const disableUser = (uid) => post(`users/${id(uid)}/disable`);
export const enableUser = (uid) => post(`users/${id(uid)}/enable`);
export const deleteUser = (uid) => send(`users/${id(uid)}`, { method: "DELETE" });
export const getAudit = ({ before, limit } = {}) => send(`audit${query({ before, limit })}`);

export const getSystem = () => send("system");
export const reloadArchive = () => post("system/reload");
