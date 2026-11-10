import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  select,
  zoom,
  zoomIdentity
} from "d3";
import { getGraph } from "./api";

const W = 1000;
const H = 560;
const TICKS = 300;
const FIT_PADDING = 48;
const MAX_FIT_SCALE = 2.4;
const ZOOM_STEP = 1.5;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 10;
const AUTHOR_LABEL_ZOOM = 1.5;
const WORK_LABEL_ZOOM = 2.5;
const HUB_WORKS = 3;
const DENSE = 60;
const R_AUTHOR = 6;
const R_WORK = 5.5;

const radius = (n, degree) => (n.kind === "author" ? R_AUTHOR + 1.6 * Math.sqrt(degree.get(n.id) || 0) : R_WORK);

function degrees(links) {
  return links.reduce((m, l) => m.set(l.source, (m.get(l.source) || 0) + 1), new Map());
}

function settle(nodes, links, degree) {
  const ids = new Set(nodes.map((n) => n.id));
  const simNodes = nodes.map((n) => ({ ...n }));
  const simLinks = links.filter((l) => ids.has(l.source) && ids.has(l.target)).map((l) => ({ ...l }));
  forceSimulation(simNodes)
    .force("link", forceLink(simLinks).id((n) => n.id).distance(30).strength(0.9))
    .force("charge", forceManyBody().strength((n) => (n.kind === "author" ? -260 : -45)))
    .force("collide", forceCollide((n) => radius(n, degree) + (n.kind === "author" ? 14 : 4)))
    .force("x", forceX(0).strength(0.035))
    .force("y", forceY(0).strength(0.09))
    .stop()
    .tick(TICKS);
  return new Map(simNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

function fitTransform(pos) {
  const pts = [...pos.values()];
  if (!pts.length) return zoomIdentity;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min(
    (W - 2 * FIT_PADDING) / Math.max(x1 - x0, 1),
    (H - 2 * FIT_PADDING) / Math.max(y1 - y0, 1),
    MAX_FIT_SCALE
  );
  return zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2).scale(k);
}

const motion = (ms) =>
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function GraphView({ keywords, mode }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const [t, setT] = useState(zoomIdentity);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
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

  const degree = useMemo(() => (data ? degrees(data.links) : new Map()), [data]);
  const pos = useMemo(() => (data ? settle(data.nodes, data.links, degree) : null), [data, degree]);
  const fit = useMemo(() => (pos ? fitTransform(pos) : zoomIdentity), [pos]);

  useEffect(() => {
    if (!svgRef.current) return undefined;
    const behavior = zoom()
      .scaleExtent([fit.k * MIN_ZOOM, fit.k * MAX_ZOOM])
      .filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : !e.button))
      .on("zoom", (e) => setT(e.transform));
    const svg = select(svgRef.current).call(behavior).call(behavior.transform, fit);
    zoomRef.current = behavior;
    return () => svg.on(".zoom", null);
  }, [fit]);

  const zoomBy = (factor) =>
    select(svgRef.current).transition().duration(motion(250)).call(zoomRef.current.scaleBy, factor);
  const refit = () =>
    select(svgRef.current).transition().duration(motion(400)).call(zoomRef.current.transform, fit);

  if (error) return <div className="bh-empty">{error}</div>;
  if (!data) return <div className="bh-empty">Loading graph&hellip;</div>;
  if (!data.nodes.length) return <div className="bh-empty">Nothing to draw for this selection.</div>;

  const authors = data.nodes.filter((n) => n.kind === "author");
  const dense = data.nodes.length > DENSE;
  const showAuthorLabels = !dense || t.k >= fit.k * AUTHOR_LABEL_ZOOM;
  const showWorkLabels = !dense || t.k >= fit.k * WORK_LABEL_ZOOM;
  const at = (id) => {
    const p = pos.get(id);
    return p ? t.apply([p.x, p.y]) : null;
  };
  const view = data.nodes
    .filter((n) => pos.has(n.id))
    .map((n) => {
      const isAuthor = n.kind === "author";
      const lit = hover === n.id;
      const labelled = lit || (isAuthor
        ? showAuthorLabels || (degree.get(n.id) || 0) >= HUB_WORKS
        : showWorkLabels);
      return { n, p: at(n.id), r: radius(n, degree) + (lit ? 2 : 0), isAuthor, lit, labelled };
    });

  return (
    <>
      <div className="bh-graph">
        <div className="bh-graph-tools" role="group" aria-label="Graph zoom">
          <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">&minus;</button>
          <button type="button" onClick={refit}>Fit</button>
        </div>

        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Authors and their works">
          <g>
            {data.links.map((l, i) => {
              const a = at(l.source);
              const b = at(l.target);
              if (!a || !b) return null;
              const lit = hover && (hover === l.source || hover === l.target);
              return <line key={i} className={`lnk${lit ? " on" : ""}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
            })}
          </g>

          {view.map(({ n, p, r, isAuthor, lit }) => (
            <g
              key={n.id}
              className={`nd${lit ? " on" : ""}`}
              transform={`translate(${p[0]} ${p[1]})`}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => navigate(isAuthor ? `/authors/${n.slug}` : `/works/${n.slug}`)}
            >
              <circle className={isAuthor ? "nd-author" : "nd-work"} r={r} />
            </g>
          ))}

          <g>
            {view.filter((v) => v.labelled).map(({ n, p, r, isAuthor }) => (
              <text
                key={n.id}
                className={isAuthor ? "lbl-author" : undefined}
                x={p[0]}
                y={p[1] - r - 6}
                textAnchor="middle"
              >
                {clip(n.label, isAuthor ? 28 : 22)}
              </text>
            ))}
          </g>
        </svg>
      </div>

      <p className="bh-sub" style={{ paddingTop: 12 }}>
        {authors.length} {authors.length === 1 ? "author" : "authors"} &middot; {data.nodes.length - authors.length} works
        &middot; drag to move, pinch or &#8984;/Ctrl + scroll to zoom
        {!showAuthorLabels && " · zoom in to see every name"}
        {showAuthorLabels && !showWorkLabels && " · zoom in further to see work titles"}
        {data.truncated && " · showing the first 300"}
      </p>
    </>
  );
}
