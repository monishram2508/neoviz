import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ContributionItem from "./ContributionItem";
import { FIELD_LABELS } from "./ContributionForm";
import { atLeast, useAccount } from "./account";
import { TYPE_LABELS, actorLabel, ago, dateTime, describeEvent } from "./format";
import { decide, getHistory, getPreview, getQueue, retract } from "./memberApi";

const TABS = [
{ key: "waiting", label: "Pending", status: "pending" },
{ key: "changes", label: "Changes requested", status: "changes_requested" },
{ key: "decided", label: "Resolved", status: "approved,rejected,withdrawn,retracted" }];


const STATUS_LABELS = {
  pending: "Pending",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  retracted: "Retracted"
};

const NEW_WORK_FIELDS = [
["title", "Title"],
["author", "Author"],
["year", "Year"],
["genre", "Genre"],
["language", "Language"],
["magazine", "Magazine"],
["engInfo", "English description"],
["urduInfo", "Urdu description"]];


const RETRACTABLE = ["note", "citation"];
const REASON_MAX = 2000;
const URDU = { dir: "rtl", lang: "ur" };

const lastTouched = (s) => s.decidedAt || s.updatedAt || s.createdAt || "";

const newestFirst = (rows) => [...rows].sort((a, b) => lastTouched(b).localeCompare(lastTouched(a)));

const cleanOverrides = (overrides) => {
  const entries = Object.entries(overrides).
  map(([k, v]) => [k, v.trim()]).
  filter(([, v]) => v);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

function Chips({ title, items }) {
  if (!items || !items.length) return null;
  return (
    <div>
      <span className="bh-step-h">{title}</span>
      <div className="bh-kw">
        {items.map((k) =>
        <span key={k} className="bh-kw-chip">{k}</span>
        )}
      </div>
    </div>);

}

function KeywordPlan({ item, plan, overrides, setOverrides }) {
  const { type, payload } = item;
  const keywords = plan?.keywords;
  return (
    <>
      {type === "new_work" &&
      <dl className="bh-dl">
          {NEW_WORK_FIELDS.filter(([k]) => payload[k]).map(([k, label]) =>
        <div key={k}>
              <dt>{label}</dt>
              <dd {...k === "urduInfo" ? URDU : {}}>{payload[k]}</dd>
            </div>
        )}
        </dl>
      }
      {!keywords ?
      <Chips title="Keywords sent" items={payload.keywords} /> :

      <div className="bh-kwplan">
          <Chips title="Will be added" items={keywords.willAdd} />
          <Chips title="Already on this work" items={keywords.alreadyOnWork} />
          <Chips title="Matched to existing keywords" items={keywords.matchedExisting.map((m) => `${m.submitted} → ${m.canonical}`)} />
          {keywords.newToArchive.length > 0 &&
        <div>
              <span className="bh-step-h">Not yet in the archive</span>
              {keywords.newToArchive.map((k) =>
          <label key={k} className="bh-field bh-override">
                  <span>{k}</span>
                  <input
              className="bh-input"
              placeholder="Keep as it is, or type an existing keyword to use instead"
              value={overrides[k] || ""}
              onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))} />

                </label>
          )}
            </div>
        }
        </div>
      }
    </>);

}

function Proposal({ item, plan, overrides, setOverrides }) {
  const { type, payload } = item;
  if (type === "note" || type === "citation") {
    return <ContributionItem item={{ type, ...payload }} showContributor={false} />;
  }
  if (type === "correction") {
    const current = plan?.correction ? plan.correction.current : payload.before;
    const dir = payload.field === "urduInfo" ? URDU : {};
    return (
      <>
        <span className="bh-step-h">{FIELD_LABELS[payload.field] || payload.field}</span>
        <div className="bh-two">
          <div>
            <span className="bh-step-h">Current</span>
            <p className="bh-compare" {...dir}>{current || "Not set"}</p>
          </div>
          <div>
            <span className="bh-step-h">Proposed</span>
            <p className="bh-compare proposed" {...dir}>{payload.value}</p>
          </div>
        </div>
        <p className="bh-contrib-text"><b>Contributor’s reason:</b> {payload.reason}</p>
      </>);

  }
  return <KeywordPlan item={item} plan={plan} overrides={overrides} setOverrides={setOverrides} />;
}

function History({ events, type }) {
  if (!events.length) return null;
  return (
    <div className="bh-history">
      <span className="bh-step-h">History</span>
      <ol className="bh-log">
        {events.map((e) =>
        <li key={e.id}>
            <time>{dateTime(e.at)}</time>
            <span>
              <b>{actorLabel(e)}</b> {describeEvent({ ...e, submissionType: type })}
              {e.reason ? ` — “${e.reason}”` : ""}
            </span>
          </li>
        )}
      </ol>
    </div>);

}

function Decide({ item, plan, overrides, onDone, onConflict }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const hasReason = Boolean(reason.trim());

  const act = async (decision) => {
    setBusy(true);
    setError(null);
    try {
      await decide(item.id, {
        decision,
        note: reason.trim() || undefined,
        keywordOverrides: cleanOverrides(overrides),
        version: item.version
      });
      onDone();
    } catch (err) {
      if (err.status === 409) onConflict(err.message);else
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-decide">
      <label className="bh-field">
        <span>Reason</span>
        <textarea className="bh-textarea short" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
        <small>Required when rejecting or requesting changes. The contributor will see this reason, but not who made the decision.</small>
      </label>
      {error && <p className="bh-error" role="alert">{error}</p>}
      <div className="bh-actions">
        <button type="button" className="bh-btn" disabled={busy || Boolean(plan?.blocked)} onClick={() => act("approve")}>Approve</button>
        <button type="button" className="bh-btn quiet" disabled={busy || !hasReason} onClick={() => act("request_changes")}>Request changes</button>
        <button type="button" className="bh-btn danger" disabled={busy || !hasReason} onClick={() => act("reject")}>Reject</button>
      </div>
    </div>);

}

function Retract({ item, onDone }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(null);

  const go = async () => {
    setError(null);
    try {
      await retract(item.id, reason.trim());
      onDone();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="bh-decide">
      <label className="bh-field">
        <span>Retract this {item.type === "citation" ? "source" : "note"}</span>
        <textarea className="bh-textarea short" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
        <small>This removes it from the public site. The contributor will see the reason.</small>
      </label>
      {error && <p className="bh-error" role="alert">{error}</p>}
      <div className="bh-actions">
        <button type="button" className="bh-btn danger" disabled={!reason.trim()} onClick={go}>Retract</button>
      </div>
    </div>);

}

function ItemDetail({ item, account, onDone, onConflict }) {
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [history, setHistory] = useState([]);
  const [overrides, setOverrides] = useState({});
  const pending = item.status === "pending";
  const canRetract = item.status === "approved" && RETRACTABLE.includes(item.type) && atLeast(account.role, "admin");
  const from = item.submittedBy;

  useEffect(() => {
    let live = true;
    getHistory(item.id).
    then((events) => live && setHistory(events)).
    catch(() => live && setHistory([]));
    if (pending) {
      getPreview(item.id).
      then((preview) => live && setPlan(preview.plan)).
      catch((err) => live && setPlanError(err.message));
    }
    return () => {
      live = false;
    };
  }, [item.id, pending]);

  return (
    <article className="bh-panel">
      <p className="bh-contrib-kind">
        {TYPE_LABELS[item.type]}{item.target ? ` · ${item.target}` : ""} · {STATUS_LABELS[item.status]}
      </p>
      <p className="bh-sub bh-review-from">
        From {from.displayName ? <Link className="bh-link" to={`/people/${from.id}`}>{from.displayName}</Link> : "Deleted user"}
        {" "}· sent {ago(item.createdAt)}
        {item.updatedAt ? ` · edited ${ago(item.updatedAt)}` : ""}
      </p>
      <Proposal item={item} plan={plan} overrides={overrides} setOverrides={setOverrides} />
      {planError && <p className="bh-error">{planError}</p>}
      {plan?.warnings?.length > 0 &&
      <ul className="bh-warnings">
          {plan.warnings.map((w) =>
        <li key={w}>{w}</li>
        )}
        </ul>
      }
      {item.moderatorNote && !pending && <p className="bh-reason"><b>Reason:</b> {item.moderatorNote}</p>}
      {pending && <Decide item={item} plan={plan} overrides={overrides} onDone={onDone} onConflict={onConflict} />}
      {canRetract && <Retract item={item} onDone={onDone} />}
      <History events={history} type={item.type} />
    </article>);

}

function Queue({ account }) {
  const [tab, setTab] = useState("waiting");
  const [items, setItems] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(
    async (keepIndex = null) => {
      const { status } = TABS.find((t) => t.key === tab);
      try {
        const rows = await getQueue({ status });
        const ordered = tab === "decided" ? newestFirst(rows) : rows;
        setItems(ordered);
        setError(null);
        setSelectedId((current) => {
          if (keepIndex !== null) return ordered[Math.min(keepIndex, ordered.length - 1)]?.id ?? null;
          return ordered.some((r) => r.id === current) ? current : ordered[0]?.id ?? null;
        });
      } catch (err) {
        setError(err.message);
      }
    },
    [tab]
  );

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const selected = items?.find((i) => i.id === selectedId) || null;
  const selectedIndex = () => Math.max(0, items.findIndex((i) => i.id === selectedId));
  const afterDecision = () => {
    setNotice(null);
    return tab === "decided" ? load() : load(selectedIndex());
  };
  const afterConflict = (message) => {
    setNotice(message);
    load(selectedIndex());
  };
  const choose = (id) => {
    setNotice(null);
    setSelectedId(id);
  };

  return (
    <div className="bh-review">
      <aside className="bh-review-list">
        <div className="bh-tabs" role="tablist">
          {TABS.map((t) =>
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "on" : undefined}
            onClick={() => {
              setTab(t.key);
              choose(null);
            }}>

              {t.label}
            </button>
          )}
        </div>
        {error && <p className="bh-error">{error}</p>}
        {!items && !error && <p className="bh-sub">Loading…</p>}
        {items && items.length === 0 && <div className="bh-empty">No items to show.</div>}
        {items && items.length > 0 &&
        <ul className="bh-pick bh-queue">
            {items.map((s) =>
          <li key={s.id}>
                <button
              type="button"
              className={s.id === selectedId ? "on" : undefined}
              aria-current={s.id === selectedId ? "true" : undefined}
              onClick={() => choose(s.id)}>

                  <span><b>{TYPE_LABELS[s.type]}</b> · {s.target || "—"}</span>
                  <small>
                    {s.submittedBy.displayName || "Deleted user"} · {ago(tab === "decided" ? lastTouched(s) : s.createdAt)}
                    {tab === "decided" ? ` · ${STATUS_LABELS[s.status]}` : ""}
                  </small>
                </button>
              </li>
          )}
          </ul>
        }
      </aside>
      <section className="bh-review-item">
        {notice && <p className="bh-error bh-notice" role="alert">{notice}</p>}
        {selected ?
        <ItemDetail
          key={`${selected.id}:${selected.version}`}
          item={selected}
          account={account}
          onDone={afterDecision}
          onConflict={afterConflict} /> :


        <div className="bh-empty">{items && items.length === 0 ? "There are no contributions awaiting review." : "Select an item to review."}</div>
        }
      </section>
    </div>);

}

export default function Review() {
  const { account, loading } = useAccount();
  if (loading) return <div className="bh-empty bh-page-head">Loading&hellip;</div>;
  if (!account || !atLeast(account.role, "moderator")) {
    return <div className="bh-empty bh-page-head">You do not have permission to view this page.</div>;
  }
  return (
    <>
      <header className="bh-page-head">
        <h1 className="bh-h1">Review</h1>
        <p className="bh-sub">Approve, reject or request changes to contributions before they are published.</p>
      </header>
      <Queue account={account} />
    </>);

}
