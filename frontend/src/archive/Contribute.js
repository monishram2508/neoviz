import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import ContributionForm from "./ContributionForm";
import { getAuthor, getAuthors, getWorks } from "./api";
import { submit } from "./memberApi";
import { useAccount } from "./account";
import { duplicateKeys, keyOf, matches } from "./search";

const WORK_LIMIT = 200;
const SUCCESS = "Thanks — this is waiting for review.";
const NO_NAME = "Set a display name on your profile before contributing.";
const DUPLICATE_LABEL = "Duplicate record — waiting for the archive team";
const DUPLICATE_COPY =
"This title matches more than one record in the archive. The archive team needs to resolve the duplicate first.";

const TYPES = {
  work: ["note", "citation", "correction", "add_keywords"],
  author: ["note", "citation", "correction"]
};

const TYPE_INFO = {
  note: ["A note", "Context, background, or anything a reader should know."],
  citation: ["A source", "A book, article or link that discusses it."],
  correction: ["A correction", "Fix the year, a description or a biography."],
  add_keywords: ["Keywords", "Themes and subjects that help people find this work."]
};

const STARTS = [
{ params: { pick: "work" }, title: "An existing work", text: "Add a note, a source, a correction or keywords to a work." },
{ params: { pick: "author" }, title: "An author", text: "Add a note, a source or a correction to an author's page." },
{ params: { new: "work" }, title: "A new work", text: "Tell us about a work that is missing from the archive." }];


const FIELD = { work: "title", author: "name" };

function Head() {
  return (
    <header className="bh-page-head">
      <h1 className="bh-h1">Contribute</h1>
      <p className="bh-sub">Everything you add is checked by a moderator before it appears on the site.</p>
    </header>);

}

function SignedOut({ next }) {
  const query = `?next=${encodeURIComponent(next)}`;
  return (
    <section className="bh-narrow">
      <Head />
      <p className="bh-lede">You need an account to contribute.</p>
      <div className="bh-actions">
        <Link className="bh-btn" to={`/signin${query}`}>Sign in</Link>
        <Link className="bh-btn quiet" to={`/join${query}`}>Join</Link>
      </div>
    </section>);

}

function NeedsName({ id }) {
  return (
    <section className="bh-narrow">
      <Head />
      <p className="bh-error">{NO_NAME}</p>
      <div className="bh-actions bh-after">
        <Link className="bh-btn" to={`/people/${id}`}>Go to your profile</Link>
      </div>
    </section>);

}

function Done({ account, onAgain }) {
  return (
    <section className="bh-narrow">
      <Head />
      <p className="bh-ok" role="status">{SUCCESS}</p>
      <div className="bh-actions bh-after">
        <Link className="bh-btn" to={`/people/${account.id}`}>See it on your profile</Link>
        <button type="button" className="bh-btn quiet" onClick={onAgain}>Contribute something else</button>
      </div>
    </section>);

}

function Start({ go }) {
  return (
    <>
      <h2 className="bh-step-h">What are you contributing to?</h2>
      <div className="bh-choices">
        {STARTS.map((s) =>
        <button key={s.title} type="button" className="bh-choice" onClick={() => go(s.params)}>
            <b>{s.title}</b>
            <span>{s.text}</span>
          </button>
        )}
      </div>
    </>);

}

function Bar({ label, title, onBack, backLabel }) {
  return (
    <div className="bh-target">
      <div>
        <span className="bh-step-h">{label}</span>
        <b>{title}</b>
      </div>
      <button type="button" className="bh-linkbtn" onClick={onBack}>{backLabel}</button>
    </div>);

}

function Picker({ kind, items, onPick, onBack }) {
  const [query, setQuery] = useState("");
  const field = FIELD[kind];
  const dupes = useMemo(() => duplicateKeys(items, field), [items, field]);
  const shown = items.filter((item) => matches(query, item[field], kind === "work" ? item.author : item.language));
  const noun = kind === "work" ? "work" : "author";

  return (
    <>
      <Bar label="Step 1" title={`Choose ${kind === "work" ? "a work" : "an author"}`} onBack={onBack} backLabel="Back" />
      <input
        className="bh-search"
        type="search"
        placeholder={`Search ${noun}s`}
        aria-label={`Search ${noun}s`}
        value={query}
        onChange={(e) => setQuery(e.target.value)} />

      {shown.length === 0 && <div className="bh-empty">Nothing matches “{query}”.</div>}
      <ul className="bh-pick">
        {shown.map((item) => {
          const duplicate = dupes.has(keyOf(item[field]));
          return (
            <li key={item.slug}>
              <button type="button" disabled={duplicate} onClick={() => onPick(item.slug)}>
                <span>{item[field]}</span>
                <small>{duplicate ? DUPLICATE_LABEL : kind === "work" ? item.author || "" : item.language || ""}</small>
              </button>
            </li>);

        })}
      </ul>
    </>);

}

function useAuthorDetails(kind, slug) {
  const [details, setDetails] = useState(null);
  useEffect(() => {
    if (kind !== "author") return undefined;
    let live = true;
    setDetails(null);
    getAuthor(slug).
    then((d) => live && setDetails(d.author)).
    catch(() => live && setDetails({}));
    return () => {
      live = false;
    };
  }, [kind, slug]);
  return details;
}

function TargetStep({ kind, item, onSend, onBack }) {
  const [type, setType] = useState(null);
  const authorDetails = useAuthorDetails(kind, item.slug);
  const current = kind === "work" ? item : authorDetails;
  const title = item[FIELD[kind]];

  return (
    <>
      <Bar label={kind === "work" ? "Work" : "Author"} title={title} onBack={onBack} backLabel="Choose something else" />
      <h2 className="bh-step-h">What would you like to add?</h2>
      <div className="bh-choices">
        {TYPES[kind].map((t) =>
        <button
          key={t}
          type="button"
          className={`bh-choice${type === t ? " on" : ""}`}
          aria-pressed={type === t}
          onClick={() => setType(t)}>

            <b>{TYPE_INFO[t][0]}</b>
            <span>{TYPE_INFO[t][1]}</span>
          </button>
        )}
      </div>
      {type && (type !== "correction" || current) &&
      <ContributionForm
        key={type}
        type={type}
        targetKind={kind}
        current={current}
        onSubmit={(payload) => onSend({ type, targetKind: kind, target: title, ...payload })} />

      }
    </>);

}

function Target({ kind, slug, items, onSend, go }) {
  const item = items.find((i) => i.slug === slug);
  const back = () => go({ pick: kind });
  if (!item) {
    return (
      <>
        <div className="bh-empty">That {kind} isn’t in the archive.</div>
        <button type="button" className="bh-linkbtn bh-after" onClick={back}>Choose another</button>
      </>);

  }
  if (duplicateKeys(items, FIELD[kind]).has(keyOf(item[FIELD[kind]]))) {
    return (
      <>
        <Bar label={DUPLICATE_LABEL} title={item[FIELD[kind]]} onBack={back} backLabel="Choose another" />
        <div className="bh-empty">{DUPLICATE_COPY}</div>
      </>);

  }
  return <TargetStep key={slug} kind={kind} item={item} onSend={onSend} onBack={back} />;
}

function Wizard({ account }) {
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const [lists, setLists] = useState(null);
  const [error, setError] = useState(null);
  const [doneFor, setDoneFor] = useState(null);

  useEffect(() => {
    let live = true;
    Promise.all([getWorks({ limit: WORK_LIMIT }), getAuthors()]).
    then(([w, a]) => live && setLists({ work: w.works, author: a.authors })).
    catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  const go = (next) => {
    setDoneFor(null);
    setParams(next);
  };
  const onSend = async (body) => {
    await submit(body);
    setDoneFor(search);
  };

  if (doneFor !== null && doneFor === search) return <Done account={account} onAgain={() => go({})} />;
  if (error) return <div className="bh-empty">{error}</div>;

  const workSlug = params.get("work");
  const authorSlug = params.get("author");
  const pick = params.get("pick");

  const body = (() => {
    if (params.get("new") === "work") {
      return (
        <>
          <Bar label="New work" title="A work missing from the archive" onBack={() => go({})} backLabel="Back" />
          <ContributionForm type="new_work" onSubmit={(payload) => onSend({ type: "new_work", ...payload })} />
        </>);

    }
    if (!workSlug && !authorSlug && !FIELD[pick]) return <Start go={go} />;
    if (!lists) return <p className="bh-sub">Loading the archive…</p>;
    if (workSlug) return <Target kind="work" slug={workSlug} items={lists.work} onSend={onSend} go={go} />;
    if (authorSlug) return <Target kind="author" slug={authorSlug} items={lists.author} onSend={onSend} go={go} />;
    return <Picker kind={pick} items={lists[pick]} onPick={(slug) => go({ [pick]: slug })} onBack={() => go({})} />;
  })();

  return (
    <section className="bh-wide">
      <Head />
      {body}
    </section>);

}

export default function Contribute() {
  const { account, loading } = useAccount();
  const { pathname, search } = useLocation();
  if (loading) return <p className="bh-sub bh-page-head">Loading…</p>;
  if (!account) return <SignedOut next={pathname + search} />;
  if (!account.displayName) return <NeedsName id={account.id} />;
  return <Wizard account={account} />;
}
