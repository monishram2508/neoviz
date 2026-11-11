import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ContributionForm, { FIELD_LABELS } from "./ContributionForm";
import { ContributionBody } from "./ContributionItem";
import { ROLE_LABELS, STORED_ROLES, atLeast, useAccount } from "./account";
import { TYPE_LABELS, actorLabel, dateTime, describeEvent, longDate } from "./format";
import {
  deleteUser,
  disableUser,
  editSubmission,
  enableUser,
  getPerson,
  getPersonFull,
  setRole,
  updateMe,
  withdrawSubmission } from
"./memberApi";

const SECTIONS = [
["pending", "Waiting for review"],
["changes_requested", "Changes requested"],
["rejected", "Rejected"],
["retracted", "Retracted"],
["withdrawn", "Withdrawn"]];


const EDITABLE = ["pending", "changes_requested"];
const SHOWS_REASON = ["changes_requested", "rejected", "retracted"];

const targetHref = (target) => `/${target.kind === "author" ? "authors" : "works"}/${target.slug}`;

const groupByTarget = (items) =>
items.reduce((groups, item) => {
  const key = `${item.target.kind}:${item.target.label}`;
  const found = groups.find((g) => g.key === key);
  return found ?
  groups.map((g) => g === found ? { ...g, items: [...g.items, item] } : g) :
  [...groups, { key, target: item.target, items: [item] }];
}, []);

function PayloadSummary({ type, payload }) {
  if (type === "note" || type === "citation") return <ContributionBody item={{ type, ...payload }} />;
  if (type === "correction") {
    return (
      <p className="bh-contrib-text">
        <b>{FIELD_LABELS[payload.field] || payload.field}:</b> {payload.before || "not set"} &rarr; {payload.value}
        {payload.reason ? `\nReason: ${payload.reason}` : ""}
      </p>);

  }
  if (type === "add_keywords") {
    return (
      <>
        <p className="bh-contrib-text">{(payload.keywords || []).join(", ")}</p>
        {payload.keywordsUrdu?.length > 0 &&
        <p className="bh-contrib-text ur" dir="rtl" lang="ur">{payload.keywordsUrdu.join("، ")}</p>
        }
      </>);

  }
  return (
    <p className="bh-contrib-text">
      <b>{payload.title}</b>
      {payload.author ? ` by ${payload.author}` : ""}
      {payload.year ? `, ${payload.year}` : ""}
    </p>);

}

function ApprovedList({ contributions }) {
  if (!contributions.length) return <p className="bh-sub">No published contributions yet.</p>;
  return groupByTarget(contributions).map(({ key, target, items }) =>
  <section key={key} className="bh-panel">
      <h3 className="bh-group-h">
        {target.slug ? <Link className="bh-link" to={targetHref(target)}>{target.label}</Link> : target.label}
      </h3>
      {items.map((c) =>
    <article key={c.id} className="bh-contrib">
          <PayloadSummary type={c.type} payload={c.payload} />
          <footer className="bh-contrib-foot">
            <span>{TYPE_LABELS[c.type]}</span>
            <span>{longDate(c.approvedAt)}</span>
          </footer>
        </article>
    )}
    </section>
  );
}

function SubmissionCard({ submission, owner, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const { type, payload, targetKind, target, status } = submission;
  const editable = owner && EDITABLE.includes(status);

  const withdraw = async () => {
    if (!window.confirm("Withdraw this contribution? It will not be reviewed.")) return;
    try {
      await withdrawSubmission(submission.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async (next) => {
    await editSubmission(submission.id, next);
    setEditing(false);
    onChanged();
  };

  return (
    <article className="bh-panel bh-contrib">
      <p className="bh-contrib-kind">{TYPE_LABELS[type]}{target ? ` · ${target}` : ""}</p>
      {editing ?
      <ContributionForm
        type={type}
        targetKind={targetKind}
        initial={payload}
        current={type === "correction" ? { [payload.field]: payload.before } : undefined}
        onSubmit={save}
        submitLabel="Save and send for review" /> :


      <PayloadSummary type={type} payload={payload} />
      }
      {submission.moderatorNote && SHOWS_REASON.includes(status) &&
      <p className="bh-reason"><b>Reason:</b> {submission.moderatorNote}</p>
      }
      <footer className="bh-contrib-foot">
        <span>Sent {longDate(submission.createdAt)}</span>
        {submission.updatedAt && <span>Edited {longDate(submission.updatedAt)}</span>}
        {editable &&
        <span className="bh-actions">
            <button type="button" className="bh-btn small quiet" onClick={() => setEditing((e) => !e)}>
              {editing ? "Cancel" : "Edit"}
            </button>
            <button type="button" className="bh-btn small danger" onClick={withdraw}>Withdraw</button>
          </span>
        }
      </footer>
      {error && <p className="bh-error" role="alert">{error}</p>}
    </article>);

}

function Settings({ onSaved }) {
  const { account, refresh } = useAccount();
  const [name, setName] = useState(account.displayName || "");
  const [show, setShow] = useState(Boolean(account.showEmail));
  const [status, setStatus] = useState(null);

  const save = async (event) => {
    event.preventDefault();
    setStatus(null);
    try {
      await updateMe({ displayName: name, showEmail: show });
      await refresh();
      onSaved();
      setStatus({ ok: "Saved." });
    } catch (err) {
      setStatus({ error: err.message });
    }
  };

  return (
    <section id="settings" className="bh-panel">
      <h2>Your settings</h2>
      <form className="bh-form" onSubmit={save}>
        <label className="bh-field">
          <span>Display name</span>
          <input className="bh-input" required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <small>Shown next to everything you contribute.</small>
        </label>
        <label className="bh-check">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span>Show my email ({account.email}) on my profile</span>
        </label>
        {status?.error && <p className="bh-error" role="alert">{status.error}</p>}
        {status?.ok && <p className="bh-ok" role="status">{status.ok}</p>}
        <div className="bh-actions">
          <button className="bh-btn" type="submit">Save</button>
        </div>
      </form>
    </section>);

}

function AdminControls({ person, viewer, onChanged }) {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const manageable = !atLeast(person.role, viewer.role);
  const roles = STORED_ROLES.filter((r) => !atLeast(r, viewer.role));

  const act = async (fn) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async () => {
    const question = `Delete ${person.displayName}'s account? Their contributions stay, credited to "Deleted user". This cannot be undone.`;
    if (!window.confirm(question)) return;
    try {
      await deleteUser(person.id);
      navigate("/admin");
    } catch (err) {
      setError(err.message);
    }
  };

  if (!manageable) {
    return (
      <section className="bh-panel">
        <h2>Account</h2>
        <p className="bh-sub">{ROLE_LABELS[person.role]}. Only someone with a higher role can change this account.</p>
      </section>);

  }

  return (
    <section className="bh-panel">
      <h2>Account</h2>
      <div className="bh-actions">
        <label className="bh-field bh-inline">
          <span>Role</span>
          <select className="bh-select" value={person.role} onChange={(e) => act(() => setRole(person.id, e.target.value))}>
            {roles.map((r) =>
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            )}
          </select>
        </label>
        {person.disabled ?
        <button type="button" className="bh-btn small quiet" onClick={() => act(() => enableUser(person.id))}>Enable account</button> :

        <button type="button" className="bh-btn small danger" onClick={() => act(() => disableUser(person.id))}>Disable account</button>
        }
        {atLeast(viewer.role, "sysadmin") &&
        <button type="button" className="bh-btn small danger" onClick={remove}>Delete account</button>
        }
      </div>
      {error && <p className="bh-error" role="alert">{error}</p>}
    </section>);

}

function ActivityLog({ log }) {
  return (
    <section className="bh-panel">
      <h2>Activity</h2>
      {log.length ?
      <ol className="bh-log">
          {log.map((e) =>
        <li key={e.id}>
              <time>{dateTime(e.at)}</time>
              <span>
                <b>{actorLabel(e)}</b> {describeEvent(e)}
                {e.reason ? ` — “${e.reason}”` : ""}
              </span>
            </li>
        )}
        </ol> :

      <p className="bh-sub">Nothing yet.</p>
      }
    </section>);

}

function OwnSubmissions({ submissions, owner, onChanged }) {
  return SECTIONS.map(([status, title]) => {
    const items = submissions.filter((s) => s.status === status);
    if (!items.length) return null;
    return (
      <section key={status}>
        <h2 className="bh-section-h">{title}</h2>
        {items.map((s) =>
        <SubmissionCard key={s.id} submission={s} owner={owner} onChanged={onChanged} />
        )}
      </section>);

  });
}

export default function Profile() {
  const { id } = useParams();
  const { account, loading } = useAccount();
  const [state, setState] = useState({ data: null, error: null });
  const owner = Boolean(account) && String(account.id) === id;
  const admin = Boolean(account) && atLeast(account.role, "admin");
  const full = owner || admin;

  const load = useCallback(async () => {
    try {
      setState({ data: full ? await getPersonFull(id) : await getPerson(id), error: null });
    } catch (err) {
      setState({ data: null, error: err.message });
    }
  }, [id, full]);

  useEffect(() => {
    if (!loading) load();
  }, [loading, load]);

  const { data, error } = state;
  if (error) return <div className="bh-empty bh-page-head">{error}</div>;
  if (!data) return <div className="bh-empty bh-page-head">Loading&hellip;</div>;

  const email = data.email && (full && !data.showEmail ? `${data.email} (not public)` : data.email);
  const facts = [email, full && ROLE_LABELS[data.role], full && data.disabled && "Disabled"].filter(Boolean);

  return (
    <div className="bh-wide">
      <header className="bh-page-head">
        <h1 className="bh-h1">{data.displayName}</h1>
        {facts.length > 0 && <p className="bh-sub">{facts.join(" · ")}</p>}
      </header>

      {owner && <Settings onSaved={load} />}
      {admin && !owner && <AdminControls person={data} viewer={account} onChanged={load} />}
      {full && <OwnSubmissions submissions={data.submissions} owner={owner} onChanged={load} />}

      <h2 className="bh-section-h">Published contributions</h2>
      <ApprovedList contributions={data.contributions} />

      {admin && data.log && <ActivityLog log={data.log} />}
    </div>);

}
