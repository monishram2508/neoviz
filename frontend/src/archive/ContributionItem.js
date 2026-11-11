import React from "react";
import { Link } from "react-router-dom";
import { longDate } from "./format";

const SAFE_LINK = /^https?:\/\//i;

export function Contributor({ person }) {
  if (!person) return <span>Deleted user</span>;
  return <Link className="bh-link" to={`/people/${person.id}`}>{person.displayName}</Link>;
}

export function ContributionBody({ item }) {
  if (item.type === "citation") {
    return (
      <>
        <p className="bh-contrib-source">{item.source}</p>
        {item.url && SAFE_LINK.test(item.url) &&
        <p>
            <a className="bh-link" href={item.url} target="_blank" rel="nofollow noopener ugc">{item.url}</a>
          </p>
        }
        {item.comment && <p className="bh-contrib-text">{item.comment}</p>}
      </>);

  }
  return (
    <>
      {item.body && <p className="bh-contrib-text">{item.body}</p>}
      {item.bodyUrdu && <p className="bh-contrib-text ur" dir="rtl" lang="ur">{item.bodyUrdu}</p>}
    </>);

}

export default function ContributionItem({ item, showContributor = true }) {
  return (
    <article className="bh-contrib">
      <ContributionBody item={item} />
      <footer className="bh-contrib-foot">
        <span>{item.type === "citation" ? "Source" : "Note"}</span>
        {showContributor && <span>Added by <Contributor person={item.contributor} /></span>}
        {item.approvedAt && <span>{longDate(item.approvedAt)}</span>}
      </footer>
    </article>);

}

export function ContributionsSection({ items, contributeHref, label }) {
  return (
    <section className="bh-panel bh-contribs">
      <h2>Contributions</h2>
      {items.length ?
      items.map((item) => <ContributionItem key={item.id} item={item} />) :
      <p className="bh-sub">No contributions yet.</p>}
      <p className="bh-contrib-cta">
        <Link className="bh-link" to={contributeHref}>Contribute to this {label}</Link>
      </p>
    </section>);

}
