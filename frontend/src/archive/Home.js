import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Carousel from "./Carousel";
import { getAuthors } from "./api";
import { ABOUT, HERO_SLIDES } from "./content";

const NOTABLE_COUNT = 8;

const byWorks = (a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name);

function NotableAuthors() {
  const [authors, setAuthors] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getAuthors()
      .then((d) => setAuthors([...d.authors].sort(byWorks).slice(0, NOTABLE_COUNT)))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <aside className="bh-notable">
      <h2>Notable authors</h2>
      {error && <p className="bh-card-meta">Could not load authors.</p>}
      {!error && !authors && <p className="bh-card-meta">Loading&hellip;</p>}
      {authors && (
        <ol>
          {authors.map((a) => (
            <li key={a.slug}>
              <Link to={`/authors/${a.slug}`}>{a.name}</Link>
              <span>
                {a.workCount} {a.workCount === 1 ? "work" : "works"}
                {a.language ? ` · ${a.language}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      <Link to="/authors" className="bh-card-view">All authors</Link>
    </aside>
  );
}

export default function Home() {
  return (
    <>
      <div style={{ paddingTop: 24 }}>
        <Carousel
          slides={HERO_SLIDES}
          title="Bay&#257;z-e-Hay&#257;t"
          subtitle="A Literary Archive of Hyderabad"
        />
      </div>

      <div className="bh-home-split">
        <div className="bh-prose">
          {ABOUT.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <NotableAuthors />
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", paddingTop: 26 }}>
        <Link to="/authors" className="bh-card" style={{ flex: "1 1 240px", padding: "18px 20px" }}>
          <p className="bh-card-title" style={{ marginBottom: 6 }}>Browse authors</p>
          <p className="bh-card-meta">Every writer in the archive, with their collected works.</p>
        </Link>
        <Link to="/works" className="bh-card" style={{ flex: "1 1 240px", padding: "18px 20px" }}>
          <p className="bh-card-title" style={{ marginBottom: 6 }}>Search by keyword</p>
          <p className="bh-card-meta">Combine subjects to find works that share them.</p>
        </Link>
      </div>
    </>
  );
}
