import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ROLE_LABELS, STORED_ROLES, atLeast, useAccount } from "./account";
import { TYPE_LABELS, actorLabel, dateTime, describeEvent } from "./format";
import { deleteUser, disableUser, enableUser, getAudit, getUsers, setRole } from "./memberApi";
import { matches } from "./search";

const PAGE_SIZE = 50;

const TABS = [
["people", "People"],
["activity", "Activity"]];


function UserRow({ user, viewer, roles, act }) {
  const manageable = !atLeast(user.role, viewer.role);
  const name = user.displayName || `User ${user.id}`;

  const remove = () => {
    const question = `Delete ${name}'s account? Their contributions stay, credited to "Deleted user". This cannot be undone.`;
    if (window.confirm(question)) act(() => deleteUser(user.id));
  };

  return (
    <tr className={user.disabled ? "off" : undefined}>
      <td data-label="Name">
        <Link className="bh-link" to={`/people/${user.id}`}>{name}</Link>
        {user.disabled && <span className="bh-tag">Disabled</span>}
      </td>
      <td data-label="Email">{user.email}</td>
      <td data-label="Role">
        {manageable ?
        <select
          className="bh-select"
          aria-label={`Role for ${name}`}
          value={user.role}
          onChange={(e) => act(() => setRole(user.id, e.target.value))}>

            {roles.map((r) =>
          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          )}
          </select> :

        ROLE_LABELS[user.role]
        }
      </td>
      <td data-label="Waiting">{user.pending}</td>
      <td data-label="Published">{user.approved}</td>
      <td className="bh-row-actions">
        {manageable && (user.disabled ?
        <button type="button" className="bh-btn small quiet" onClick={() => act(() => enableUser(user.id))}>Enable</button> :

        <button type="button" className="bh-btn small danger" onClick={() => act(() => disableUser(user.id))}>Disable</button>)
        }
        {manageable && atLeast(viewer.role, "sysadmin") &&
        <button type="button" className="bh-btn small danger" onClick={remove}>Delete</button>
        }
      </td>
    </tr>);

}

function People({ viewer }) {
  const [users, setUsers] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState(null);
  const roles = STORED_ROLES.filter((r) => !atLeast(r, viewer.role));

  const load = useCallback(async () => {
    try {
      setUsers(await getUsers());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn) => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!users) return error ? <p className="bh-error">{error}</p> : <p className="bh-sub">Loading…</p>;
  const shown = users.filter((u) => matches(query, u.displayName, u.email));

  return (
    <>
      <input
        className="bh-search"
        type="search"
        placeholder="Search by name or email"
        aria-label="Search people"
        value={query}
        onChange={(e) => setQuery(e.target.value)} />

      {error && <p className="bh-error" role="alert">{error}</p>}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Waiting</th>
            <th>Published</th>
            <th><span className="bh-sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((u) =>
          <UserRow key={u.id} user={u} viewer={viewer} roles={roles} act={act} />
          )}
        </tbody>
      </table>
      {shown.length === 0 && <div className="bh-empty">No one matches “{query}”.</div>}
    </>);

}

function targetOf(event) {
  if (event.submissionId) {
    const kind = TYPE_LABELS[event.submissionType] || "Contribution";
    return event.submissionTarget ? `${kind} · ${event.submissionTarget}` : kind;
  }
  if (!event.subjectUserId || event.subjectUserId === event.actorId) return null;
  if (event.subjectName) return <Link className="bh-link" to={`/people/${event.subjectUserId}`}>{event.subjectName}</Link>;
  return event.details?.displayName || "Deleted user";
}

function Activity() {
  const [events, setEvents] = useState([]);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const page = useCallback(async (before) => {
    setBusy(true);
    try {
      const rows = await getAudit({ before });
      setEvents((current) => before ? [...current, ...rows] : rows);
      setFinished(rows.length < PAGE_SIZE);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    page();
  }, [page]);

  return (
    <>
      {error && <p className="bh-error" role="alert">{error}</p>}
      {events.length === 0 && !busy && !error && <div className="bh-empty">Nothing has happened yet.</div>}
      <ol className="bh-log bh-panel">
        {events.map((e) => {
          const target = targetOf(e);
          return (
            <li key={e.id}>
              <time>{dateTime(e.at)}</time>
              <span>
                <b>{actorLabel(e)}</b> {describeEvent(e)}
                {target && <> · {target}</>}
                {e.reason ? ` — “${e.reason}”` : ""}
              </span>
            </li>);

        })}
      </ol>
      {!finished && events.length > 0 &&
      <button type="button" className="bh-btn quiet" disabled={busy} onClick={() => page(events[events.length - 1].id)}>
          {busy ? "Loading…" : "Load more"}
        </button>
      }
    </>);

}

export default function Admin() {
  const { account, loading } = useAccount();
  const [tab, setTab] = useState("people");

  if (loading) return <div className="bh-empty bh-page-head">Loading&hellip;</div>;
  if (!account || !atLeast(account.role, "admin")) {
    return <div className="bh-empty bh-page-head">You need to be an admin to see this page.</div>;
  }

  return (
    <>
      <header className="bh-page-head">
        <h1 className="bh-h1">Admin</h1>
        <p className="bh-sub">Who can contribute and review, and a record of everything that has happened.</p>
      </header>
      <div className="bh-tabs bh-tabs-inline" role="tablist">
        {TABS.map(([key, label]) =>
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          className={tab === key ? "on" : undefined}
          onClick={() => setTab(key)}>

            {label}
          </button>
        )}
      </div>
      {tab === "people" ? <People viewer={account} /> : <Activity />}
    </>);

}
