import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Cover from "./Cover";
import GraphView from "./GraphView";
import { getWorks } from "./api";

export default function Works() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

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
    const has = selected.some((s) => s.toLowerCase() === label.toLowerCase());
    update(has ? selected.filter((s) => s.toLowerCase() !== label.toLowerCase()) : [...selected, label]);
  };

  if (error) return <div className="bh-empty">{error}</div>;

  const works = data ? data.works : [];
  const facets = data ? data.facets : [];

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

          <div className="bh-facets">
            {facets.length === 0 && <p className="bh-card-meta">No further keywords narrow this set.</p>}
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

          {view === "grid" ? (
            <div className="bh-grid">
              {works.map((w) => (
                <Link key={w.slug} to={`/works/${w.slug}`} className="bh-card">
                  <Cover src={null} label={w.title} note={w.hasScan ? "scan pending" : "no scan"} />
                  <div className="bh-card-body">
                    <p className="bh-card-title">{w.title}</p>
                    <p className="bh-card-meta">{w.author || "Author unrecorded"}</p>
                    <p className="bh-card-meta">{[w.year, w.genre].filter(Boolean).join(" · ")}</p>
                    <span className="bh-card-view">View</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <GraphView keywords={selected} mode={mode} />
          )}

          {data && data.total > works.length && (
            <p className="bh-sub" style={{ paddingTop: 18 }}>
              Showing the first {works.length} of {data.total}. Add a keyword to narrow further.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
