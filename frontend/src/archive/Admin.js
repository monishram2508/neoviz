import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ROLE_LABELS, STORED_ROLES, atLeast } from "./account";
import { actorLabel, describeEvent, logTime } from "./format";
import { ACTION_FILTERS, NO_FILTERS, filterEvents, itemText, sortEvents } from "./auditView";
import { deleteUser, disableUser, enableUser, getAudit, getUsers, setRole } from "./memberApi";
import { matches } from "./search";

const PAGE_SIZE = 200;

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
      <td data-label="Pending">{user.pending}</td>
      <td data-label="Approved">{user.approved}</td>
      <td className="bh-row-actions">
        {manageable && (user.disabled ?
        <button type="button" className="bh-btn small quiet" onClick={() => act(() => enableUser(user.id))}>Enable</button> :

        <button type="button" className="bh-btn small danger" onClick={() => act(() => disableUser(user.id))}>Disable</button>)
        }
        {manageable && atLeast(viewer.role, "sysadmin") &&
        <button type="button" className="bh-btn small danger bh-sys" onClick={remove}>Delete</button>
        }
      </td>
    </tr>);

}

export function People({ viewer }) {
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
            <th>Pending</th>
            <th>Approved</th>
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
  const text = itemText(event);
  if (!text) return "—";
  if (!event.submissionId && event.subjectName) return <Link className="bh-link" to={`/people/${event.subjectUserId}`}>{text}</Link>;
  return text;
}

const COLUMNS = [
["time", "Time"],
["user", "User"],
["action", "Action"],
["item", "Item"]];


function SortHeader({ column, label, sort, onSort }) {
  const active = sort.key === column;
  const direction = sort.dir === "asc" ? "ascending" : "descending";
  return (
    <th aria-sort={active ? direction : "none"}>
      <button type="button" className={active ? "bh-sort on" : "bh-sort"} onClick={() => onSort(column)}>
        {label}
        <span aria-hidden="true">{active ? sort.dir === "asc" ? "↑" : "↓" : "↕"}</span>
      </button>
    </th>);

}

function Filters({ filters, setFilters, users }) {
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const active = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  return (
    <div className="bh-audit-filters">
      <label className="bh-filter bh-filter-search">
        <span>Search</span>
        <input className="bh-input" type="search" placeholder="Name, item or reason" value={filters.text} onChange={set("text")} />
      </label>
      <label className="bh-filter">
        <span>User</span>
        <select className="bh-select" value={filters.user} onChange={set("user")}>
          <option value="">All users</option>
          {users.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="bh-filter">
        <span>Action</span>
        <select className="bh-select" value={filters.action} onChange={set("action")}>
          {ACTION_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="bh-filter">
        <span>From</span>
        <input className="bh-input" type="date" value={filters.from} onChange={set("from")} />
      </label>
      <label className="bh-filter">
        <span>To</span>
        <input className="bh-input" type="date" value={filters.to} onChange={set("to")} />
      </label>
      {active &&
      <button type="button" className="bh-linkbtn bh-filter-clear" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
      }
    </div>);

}

export function Activity() {
  const [events, setEvents] = useState([]);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState({ key: "time", dir: "desc" });
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const page = useCallback(async (before) => {
    setBusy(true);
    try {
      const rows = await getAudit({ before, limit: PAGE_SIZE });
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

  const users = useMemo(() => [...new Set(events.map(actorLabel))].sort((a, b) => a.localeCompare(b)), [events]);
  const shown = useMemo(() => sortEvents(filterEvents(events, filters), sort), [events, filters, sort]);
  const onSort = (key) =>
  setSort((current) => current.key === key ?
  { key, dir: current.dir === "asc" ? "desc" : "asc" } :
  { key, dir: key === "time" ? "desc" : "asc" });

  return (
    <>
      {error && <p className="bh-error" role="alert">{error}</p>}
      {events.length === 0 && !busy && !error && <div className="bh-empty">No activity has been recorded yet.</div>}
      {events.length > 0 &&
      <>
          <Filters filters={filters} setFilters={setFilters} users={users} />
          <p className="bh-count">
            Showing <b>{shown.length}</b> of {events.length} entries{!finished && ". Older entries can be loaded below"}.
          </p>
        </>
      }
      {events.length > 0 && shown.length === 0 && <div className="bh-empty">No entries match these filters.</div>}
      {shown.length > 0 &&
      <table className="bh-table bh-audit">
          <thead>
            <tr>
              {COLUMNS.map(([key, label]) =>
            <SortHeader key={key} column={key} label={label} sort={sort} onSort={onSort} />
            )}
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) =>
          <tr key={e.id}>
                <td data-label="Time" className="bh-audit-time"><time dateTime={e.at}>{logTime(e.at)}</time></td>
                <td data-label="User" className="bh-audit-user">{actorLabel(e)}</td>
                <td data-label="Action" className="bh-audit-action">{describeEvent(e)}</td>
                <td data-label="Item">{targetOf(e)}</td>
                <td data-label="Reason" className="bh-audit-reason">{e.reason || "—"}</td>
              </tr>
          )}
          </tbody>
        </table>
      }
      {!finished && events.length > 0 &&
      <button type="button" className="bh-btn quiet" disabled={busy} onClick={() => page(events[events.length - 1].id)}>
          {busy ? "Loading…" : "Load older entries"}
        </button>
      }
    </>);

}
