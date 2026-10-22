import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Cover from "./Cover";
import { getAuthors } from "./api";

export default function Authors() {
  const [authors, setAuthors] = useState(null);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState("all");

  useEffect(() => {
    getAuthors().then((d) => setAuthors(d.authors)).catch((e) => setError(e.message));
  }, []);

  const languages = useMemo(() => {
    if (!authors) return [];
    return [...new Set(authors.map((a) => a.language).filter(Boolean))].sort();
  }, [authors]);

  const shown = useMemo(() => {
    if (!authors) return [];
    return lang === "all" ? authors : authors.filter((a) => a.language === lang);
  }, [authors, lang]);

  if (error) return <div className="bh-empty">{error}</div>;
  if (!authors) return <div className="bh-empty">Loading&hellip;</div>;

  return (
    <>
      <div className="bh-page-head">
        <h1 className="bh-h1">Authors</h1>
        <p className="bh-sub">{shown.length} of {authors.length} writers</p>
      </div>

      {languages.length > 1 && (
        <div className="bh-chips" style={{ marginBottom: 22 }}>
          <button type="button" className={`bh-chip${lang === "all" ? " sel" : ""}`} onClick={() => setLang("all")}>
            All
          </button>
          {languages.map((l) => (
            <button
              key={l}
              type="button"
              className={`bh-chip${lang === l ? " sel" : ""}`}
              onClick={() => setLang(l)}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="bh-grid">
        {shown.map((a) => (
          <Link key={a.slug} to={`/authors/${a.slug}`} className="bh-card">
            <Cover src={a.portrait} label={a.name} portrait note="portrait pending" />
            <div className="bh-card-body">
              <p className="bh-card-title">{a.name}</p>
              <p className="bh-card-meta">
                {a.workCount} {a.workCount === 1 ? "work" : "works"}
                {a.language ? ` · ${a.language}` : ""}
              </p>
              <span className="bh-card-view">View</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
