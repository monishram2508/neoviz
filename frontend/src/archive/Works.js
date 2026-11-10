import React, { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Cover from "./Cover";
import GraphView from "./GraphView";
import LetterBar, { showLetters } from "./LetterBar";
import { firstLetter, matches } from "./search";
import { getWorks } from "./api";

const RAIL_LIMIT = 120;

export default function Works() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [kwQuery, setKwQuery] = useState("");

  const view = params.get("view") === "graph" ? "graph" : "grid";

  const selected = useMemo(() => {
    const raw = params.get("kw");
    return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  }, [params]);

  const mode = params.get("mode") === "any" ? "any" : "all";

  useEffect(() => {
    let live = true;
    setError(null);
    getWorks({ keywords: selected, mode, limit: 200 })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [selected, mode]);

  const update = useCallback(
    (next, nextMode, nextView) => {
      const p = {};
      if (next.length) p.kw = next.join(",");
      const m = nextMode || mode;
      if (m === "any") p.mode = "any";
      const v = nextView || view;
      if (v === "graph") p.view = "graph";
      setParams(p, { replace: false });
    },
    [mode, view, setParams]
  );

  const setView = (v) => update(selected, mode, v);

  const toggle = (label) => {
    setKwQuery("");
    const has = selected.some((s) => s.toLowerCase() === label.toLowerCase());
    update(has ? selected.filter((s) => s.toLowerCase() !== label.toLowerCase()) : [...selected, label]);
  };

  if (error) return <div className="bh-empty">{error}</div>;

  const works = data ? data.works.filter((w) => matches(query, w.title, w.author)) : [];
  const allFacets = data ? data.facets : [];
  const facets = kwQuery ? allFacets.filter((f) => matches(kwQuery, f.label)) : allFacets.slice(0, RAIL_LIMIT);
  const letters = new Set(works.map((w) => firstLetter(w.title)));
  const grouped = showLetters(query, works.length);

  return (
    <>
      <div className="bh-page-head">
        <h1 className="bh-h1">Works</h1>
        <p className="bh-sub">
          Every text in the archive. Combine keywords to narrow the collection.
        </p>
      </div>

      <div className="bh-works">
        <aside className="bh-rail">
          <h2>Keywords</h2>

          <div className="bh-mode" role="group" aria-label="Match mode">
            <button type="button" className={mode === "all" ? "on" : undefined} onClick={() => update(selected, "all")}>
              ALL of these
            </button>
            <button type="button" className={mode === "any" ? "on" : undefined} onClick={() => update(selected, "any")}>
              ANY of these
            </button>
          </div>

          {selected.length > 0 && (
            <div className="bh-chips">
              {selected.map((s) => (
                <button key={s} type="button" className="bh-chip sel" onClick={() => toggle(s)}>
                  {s} <span className="x">&times;</span>
                </button>
              ))}
            </div>
          )}

          <input
            type="search"
            className="bh-search bh-search-rail"
            placeholder={`Search ${allFacets.length} keywords`}
            aria-label="Search keywords"
            value={kwQuery}
            onChange={(e) => setKwQuery(e.target.value)}
          />

          <div className="bh-facets">
            {facets.length === 0 && (
              <p className="bh-card-meta">
                {kwQuery ? <>No keywords match &ldquo;{kwQuery}&rdquo;.</> : "No further keywords narrow this set."}
              </p>
            )}
            {facets.map((f) => (
              <button key={f.key} type="button" className="bh-facet" onClick={() => toggle(f.label)}>
                <span>{f.label}</span>
                <span className="n">{f.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <div>
          <div className="bh-bar">
            <span className="bh-count">
              {data ? (
                <>
                  {query && view === "grid" && <><b>{works.length}</b> of </>}
                  <b>{data.total}</b> {data.total === 1 ? "work" : "works"}
                  {selected.length > 0 && ` matching ${mode === "all" ? "all" : "any"} of ${selected.length} keyword${selected.length === 1 ? "" : "s"}`}
                </>
              ) : (
                "Loading…"
              )}
            </span>
            <div className="bh-toggle" role="group" aria-label="View">
              <button type="button" className={view === "grid" ? "on" : undefined} onClick={() => setView("grid")}>
                Grid
              </button>
              <button type="button" className={view === "graph" ? "on" : undefined} onClick={() => setView("graph")}>
                Graph
              </button>
            </div>
          </div>

          {data && data.total === 0 && (
            <div className="bh-empty">
              No works carry {mode === "all" ? "all" : "any"} of those keywords together.
            </div>
          )}

          {view === "grid" && (
            <>
              <input
                type="search"
                className="bh-search"
                placeholder="Search titles or authors"
                aria-label="Search works"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {grouped && <LetterBar letters={letters} />}
              {query && works.length === 0 && <div className="bh-empty">No works match &ldquo;{query}&rdquo;.</div>}
            </>
          )}

          {view === "grid" ? (
            <div className="bh-grid">
              {works.map((w, i) => (
                <Fragment key={w.slug}>
                  {grouped && (i === 0 || firstLetter(works[i - 1].title) !== firstLetter(w.title)) && (
                    <h2 className="bh-letter-head" data-letter={firstLetter(w.title)}>{firstLetter(w.title)}</h2>
                  )}
                  <Link to={`/works/${w.slug}`} className="bh-card">
                    <Cover src={null} label={w.title} note={w.hasScan ? "scan pending" : "no scan"} />
                    <div className="bh-card-body">
                      <p className="bh-card-title">{w.title}</p>
                      <p className="bh-card-meta">{w.author || "Author unrecorded"}</p>
                      <p className="bh-card-meta">{[w.year, w.genre].filter(Boolean).join(" · ")}</p>
                      <span className="bh-card-view">View</span>
                    </div>
                  </Link>
                </Fragment>
              ))}
            </div>
          ) : (
            <GraphView keywords={selected} mode={mode} />
          )}

          {data && !query && data.total > works.length && (
            <p className="bh-sub" style={{ paddingTop: 18 }}>
              Showing the first {works.length} of {data.total}. Add a keyword to narrow further.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
