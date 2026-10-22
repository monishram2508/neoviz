import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getGraph } from "./api";

const W = 1000;
const H = 560;
const CX = W / 2;
const CY = H / 2;

function layout(nodes, links) {
  const authors = nodes.filter((n) => n.kind === "author");
  const works = nodes.filter((n) => n.kind === "work");
  const worksBy = new Map();
  links.forEach((l) => {
    const arr = worksBy.get(l.source) || [];
    arr.push(l.target);
    worksBy.set(l.source, arr);
  });

  const pos = new Map();
  const ring = Math.min(CX, CY) - 96;
  const single = authors.length === 1;

  authors.forEach((a, i) => {
    const angle = single ? 0 : (i / authors.length) * Math.PI * 2 - Math.PI / 2;
    const ax = single ? CX : CX + Math.cos(angle) * ring * 0.62;
    const ay = single ? CY : CY + Math.sin(angle) * ring * 0.62;
    pos.set(a.id, { x: ax, y: ay });

    const kids = worksBy.get(a.id) || [];
    const full = single;
    const spread = full ? Math.PI * 2 : Math.PI * 1.05;
    const base = full ? -Math.PI / 2 : angle - spread / 2;
    const r = full ? Math.min(CX, CY) - 130 : Math.min(74 + kids.length * 5, 132);
    const divisor = full ? kids.length : Math.max(kids.length - 1, 1);
    kids.forEach((id, j) => {
      const t = kids.length === 1 && !full ? 0.5 : j / divisor;
      const ang = base + spread * t;
      pos.set(id, { x: ax + Math.cos(ang) * r, y: ay + Math.sin(ang) * r });
    });
  });

  let loose = 0;
  works.forEach((w) => {
    if (pos.has(w.id)) return;
    const ang = (loose / Math.max(works.length, 1)) * Math.PI * 2;
    pos.set(w.id, { x: CX + Math.cos(ang) * (ring + 40), y: CY + Math.sin(ang) * (ring + 40) });
    loose += 1;
  });

  return pos;
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function GraphView({ keywords, mode }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    setError(null);
    getGraph({ keywords, mode })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [keywords, mode]);

  const pos = useMemo(() => (data ? layout(data.nodes, data.links) : null), [data]);

  if (error) return <div className="bh-empty">{error}</div>;
  if (!data) return <div className="bh-empty">Loading graph&hellip;</div>;
  if (!data.nodes.length) return <div className="bh-empty">Nothing to draw for this selection.</div>;

  const authors = data.nodes.filter((n) => n.kind === "author");
  const dense = data.nodes.length > 60;
  const showLabels = !dense;

  return (
    <>
      <div className="bh-graph">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Authors and their works">
          <g>
            {data.links.map((l, i) => {
              const a = pos.get(l.source);
              const b = pos.get(l.target);
              if (!a || !b) return null;
              const lit = hover && (hover === l.source || hover === l.target);
              return (
                <line
                  key={i}
                  className="lnk"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  style={lit ? { stroke: "var(--brand)", strokeWidth: 1.6 } : undefined}
                />
              );
            })}
          </g>

          {data.nodes.map((n) => {
            const p = pos.get(n.id);
            if (!p) return null;
            const isAuthor = n.kind === "author";
            const r = isAuthor ? 9 : 5.5;
            const lit = hover === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                style={{ cursor: isAuthor ? "pointer" : "pointer" }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => navigate(isAuthor ? `/authors/${n.slug}` : `/works/${n.slug}`)}
              >
                <circle
                  className={isAuthor ? "nd-author" : "nd-work"}
                  r={lit ? r + 2 : r}
                  style={lit && !isAuthor ? { stroke: "var(--brand)", strokeWidth: 2 } : undefined}
                />
                {(showLabels || isAuthor || lit) && (
                  <text
                    className={isAuthor ? "lbl-author" : undefined}
                    y={isAuthor ? -15 : -10}
                    textAnchor="middle"
                  >
                    {clip(n.label, isAuthor ? 28 : 22)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="bh-sub" style={{ paddingTop: 12 }}>
        {authors.length} {authors.length === 1 ? "author" : "authors"} &middot;{" "}
        {data.nodes.length - authors.length} works
        {dense && " · labels hidden while the selection is broad — add a keyword to thin it out"}
        {data.truncated && " · showing the first 300"}
      </p>
    </>
  );
}
