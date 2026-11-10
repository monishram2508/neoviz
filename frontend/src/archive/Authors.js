import React, { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Cover from "./Cover";
import LetterBar, { showLetters } from "./LetterBar";
import { firstLetter, matches } from "./search";
import { getAuthors } from "./api";

export default function Authors() {
  const [authors, setAuthors] = useState(null);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    getAuthors().then((d) => setAuthors(d.authors)).catch((e) => setError(e.message));
  }, []);

  const languages = useMemo(() => {
    if (!authors) return [];
    return [...new Set(authors.map((a) => a.language).filter(Boolean))].sort();
  }, [authors]);

  const shown = useMemo(() => {
    if (!authors) return [];
    return authors.filter((a) => (lang === "all" || a.language === lang) && matches(query, a.name));
  }, [authors, lang, query]);

  const letters = useMemo(() => new Set(shown.map((a) => firstLetter(a.name))), [shown]);
  const grouped = showLetters(query, shown.length);

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

      <input
        type="search"
        className="bh-search"
        placeholder="Search authors"
        aria-label="Search authors"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {grouped && <LetterBar letters={letters} />}

      {shown.length === 0 && <div className="bh-empty">No authors match &ldquo;{query}&rdquo;.</div>}

      <div className="bh-grid">
        {shown.map((a, i) => (
          <Fragment key={a.slug}>
            {grouped && (i === 0 || firstLetter(shown[i - 1].name) !== firstLetter(a.name)) && (
              <h2 className="bh-letter-head" data-letter={firstLetter(a.name)}>{firstLetter(a.name)}</h2>
            )}
            <Link to={`/authors/${a.slug}`} className="bh-card">
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
          </Fragment>
        ))}
      </div>
    </>
  );
}
