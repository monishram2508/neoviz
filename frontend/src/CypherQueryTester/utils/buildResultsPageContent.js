// Builds the self-contained HTML document rendered inside the graph iframe.
// Design language matches the app shell: light neutral, Inter, soft shadows.

const PALETTE = [
  { bg: "#e0f2fe", border: "#38bdf8", text: "#0369a1" },
  { bg: "#dcfce7", border: "#4ade80", text: "#15803d" },
  { bg: "#fef9c3", border: "#facc15", text: "#854d0e" },
  { bg: "#f3e8ff", border: "#c084fc", text: "#7e22ce" },
  { bg: "#ffe4e6", border: "#fb7185", text: "#9f1239" },
  { bg: "#ffedd5", border: "#fb923c", text: "#c2410c" },
];

function getLabelColor(label) {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export const buildResultsPageContent = (data) => {
  const nodes = [];
  const links = [];
  const seen = new Set();

  if (!Array.isArray(data)) return "";

  data.forEach((item) => {
    Object.values(item).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.startNodeElementId && entry.endNodeElementId && entry.type) {
        links.push({
          id: entry.elementId,
          source: entry.startNodeElementId,
          target: entry.endNodeElementId,
          type: entry.type,
        });
      } else if (entry.elementId && entry.labels && entry.properties) {
        if (!seen.has(entry.elementId)) {
          seen.add(entry.elementId);
          nodes.push({
            id: entry.elementId,
            label: entry.labels[0] || "Node",
            properties: entry.properties,
          });
        }
      }
    });
  });

  // Drop links whose endpoints didn't come back (e.g. OPTIONAL MATCH nulls),
  // and de-duplicate relationships returned by multiple records.
  const linkSeen = new Set();
  const validLinks = links.filter((l) => {
    if (!seen.has(l.source) || !seen.has(l.target)) return false;
    if (linkSeen.has(l.id)) return false;
    linkSeen.add(l.id);
    return true;
  });

  const labelColors = nodes.reduce((acc, n) => {
    acc[n.label] = getLabelColor(n.label);
    return acc;
  }, {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: #fafafa;
    overflow: hidden;
    width: 100vw; height: 100vh;
    opacity: 0;
    transition: opacity 0.45s ease;
    -webkit-font-smoothing: antialiased;
  }
  body.ready { opacity: 1; }

  #container {
    width: 100%; height: 100%;
    position: relative; overflow: hidden;
    cursor: grab;
    background-image: radial-gradient(circle, #cfcfd5 1.4px, transparent 1.4px);
    background-size: 24px 24px;
  }
  #container:active { cursor: grabbing; }

  #cards {
    position: absolute; top: 0; left: 0;
    width: 0; height: 0;
    transform-origin: 0 0;
    pointer-events: none;
    --card-w: 200px;
    --card-pad: 12px 15px 10px;
    --name-fs: 14.5px;
    --tag-fs: 10.5px;
    --tag-pad: 3px 8px;
  }

  .node-card {
    position: absolute;
    background: #ffffff;
    border: 1px solid #e4e4e7;
    border-radius: 11px;
    padding: var(--card-pad);
    cursor: pointer;
    width: var(--card-w);
    box-shadow: 0 1px 2px rgba(0,0,0,0.05), 0 3px 10px rgba(0,0,0,0.04);
    transition: box-shadow 0.15s, border-color 0.15s, width 0.2s ease, padding 0.2s ease;
    user-select: none;
    pointer-events: all;
  }
  .node-card:hover {
    box-shadow: 0 2px 4px rgba(0,0,0,0.06), 0 8px 22px rgba(0,0,0,0.10);
    border-color: #d4d4d8;
  }
  .node-card.selected {
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79,70,229,0.16), 0 8px 22px rgba(0,0,0,0.08);
  }
  .node-accent {
    position: absolute;
    left: 0; top: 10px; bottom: 10px;
    width: 3px;
    border-radius: 0 3px 3px 0;
  }
  .node-name {
    font-size: var(--name-fs); font-weight: 600; color: #18181b;
    letter-spacing: -0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 4px;
    transition: font-size 0.2s ease;
  }
  .node-tag {
    display: inline-block;
    font-size: var(--tag-fs); font-weight: 600; letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: var(--tag-pad);
    border-radius: 5px;
    transition: font-size 0.2s ease, padding 0.2s ease;
  }

  .link-label-text {
    font-size: 10px; font-weight: 500; fill: #71717a;
    pointer-events: none;
    font-family: 'Inter', -apple-system, sans-serif;
    letter-spacing: 0.02em;
    paint-order: stroke; stroke: #fafafa; stroke-width: 3px; stroke-linejoin: round;
  }

  /* overlays */
  .overlay-chip {
    position: absolute;
    background: rgba(255,255,255,0.92);
    backdrop-filter: blur(6px);
    border: 1px solid #e4e4e7;
    border-radius: 9px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    font-size: 11.5px;
    color: #52525b;
    padding: 6px 11px;
    z-index: 50;
    user-select: none;
  }
  #counts { top: 14px; left: 14px; font-weight: 500; }

  #legend {
    bottom: 14px; left: 14px;
    display: flex; gap: 12px; align-items: center;
    flex-wrap: wrap; max-width: 60%;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; }
  .legend-dot { width: 9px; height: 9px; border-radius: 3px; }

  #controls {
    position: absolute;
    bottom: 14px; right: 14px;
    display: flex; flex-direction: column;
    gap: 8px;
    z-index: 50;
  }
  .ctrl-group {
    display: flex; flex-direction: column;
    border: 1px solid #e4e4e7;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    background: #fff;
  }
  .ctrl-group button {
    width: 34px; height: 32px;
    background: #ffffff;
    border: none;
    font-size: 13px;
    font-weight: 600;
    color: #52525b;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.12s, color 0.12s;
    font-family: 'Inter', -apple-system, sans-serif;
  }
  .ctrl-group button + button { border-top: 1px solid #f0f0f2; }
  .ctrl-group button:hover { background: #f4f4f5; color: #18181b; }
  #zin, #zout { font-size: 15px; font-weight: 400; }

  #hint {
    position: absolute;
    bottom: 14px; left: 50%;
    transform: translateX(-50%);
    background: rgba(24,24,27,0.78);
    color: #fff;
    font-size: 11px;
    padding: 6px 12px;
    border-radius: 7px;
    white-space: nowrap;
    pointer-events: none;
    transition: opacity 0.6s;
    z-index: 60;
  }

  .empty-state {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 10px;
    color: #a1a1aa;
  }
  .empty-icon { font-size: 28px; opacity: 0.5; }
  .empty-text { font-size: 13px; }
  .empty-sub { font-size: 12px; color: #c4c4c9; }
</style>
<script src="https://d3js.org/d3.v6.min.js"></script>
</head>
<body>
<div id="container">
  <svg id="svg" style="position:absolute;top:0;left:0;width:100%;height:100%;"></svg>
  <div id="cards"></div>

  ${nodes.length === 0 ? `
  <div class="empty-state">
    <span class="empty-icon">⬡</span>
    <span class="empty-text">No graph data returned</span>
    <span class="empty-sub">Try asking for nodes and their relationships.</span>
  </div>` : `
  <div class="overlay-chip" id="counts">${nodes.length} node${nodes.length === 1 ? "" : "s"} · ${validLinks.length} connection${validLinks.length === 1 ? "" : "s"}</div>
  <div class="overlay-chip" id="legend"></div>
  <div id="controls">
    <div class="ctrl-group">
      <button id="sizeUp" title="Bigger nodes">A+</button>
      <button id="sizeDown" title="Smaller nodes">A−</button>
    </div>
    <div class="ctrl-group">
      <button id="zin" title="Zoom in">+</button>
      <button id="zout" title="Zoom out">−</button>
      <button id="zfit" title="Fit to view">⌖</button>
    </div>
  </div>
  <div id="hint">Click a node for details · Drag to move · Scroll to zoom</div>`}
</div>

<script>
const rawNodes    = ${JSON.stringify(nodes)};
const rawLinks    = ${JSON.stringify(validLinks)};
const labelColors = ${JSON.stringify(labelColors)};

const W = window.innerWidth;
const H = window.innerHeight;

// Card geometry used for link trimming — must stay in sync with whichever
// size step is active (see sizeSteps below). Mutable so the size control
// can update it.
let CARD_HW = 106;   // half width + margin
let CARD_HH = 36;    // half height + margin
let cardOffX = 100;  // half card width, for centering the div on (x, y)
let cardOffY = 28;   // half card height, for centering the div on (x, y)
const ARROW_GAP = 7;

const d3ok = typeof d3 !== "undefined";

if (rawNodes.length > 0 && !d3ok) {
  // CDN failed (offline?) — replace overlays with a clear error message.
  ["counts", "legend", "controls", "hint"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
  document.getElementById("container").insertAdjacentHTML("beforeend",
    '<div class="empty-state"><span class="empty-icon">⚠</span>' +
    '<span class="empty-text">Could not load the graph renderer</span>' +
    '<span class="empty-sub">Check your internet connection and re-run the query.</span></div>');
}

if (rawNodes.length > 0 && d3ok) {

  const nodeCount = rawNodes.length;
  const area      = (W * H) / nodeCount;
  const charge    = -Math.max(450, Math.min(1400, area / 24));
  const linkDist  = Math.max(160, Math.min(300, Math.sqrt(area) * 0.95));
  const collide   = Math.max(100, Math.min(135, Math.sqrt(area) * 0.14));

  rawNodes.forEach(function (n) {
    n.x = W / 2 + (Math.random() - 0.5) * 220;
    n.y = H / 2 + (Math.random() - 0.5) * 220;
  });

  const svg   = d3.select("#svg");
  const zoomG = svg.append("g");
  const cards = d3.select("#cards");

  // Arrowhead marker.
  svg.append("defs").append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 9)
    .attr("markerWidth", 6.5)
    .attr("markerHeight", 6.5)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#c0c0c6");

  const zoom = d3.zoom()
    .scaleExtent([0.12, 3.5])
    .on("zoom", function (e) {
      zoomG.attr("transform", e.transform);
      cards.style("transform",
        "translate(" + e.transform.x + "px," + e.transform.y + "px) scale(" + e.transform.k + ")");
    });

  const container = d3.select("#container");
  container.call(zoom).on("dblclick.zoom", null);

  const linkEls = zoomG.selectAll(".glink")
    .data(rawLinks).enter()
    .append("line")
    .attr("class", "glink")
    .attr("stroke", "#d0d0d5")
    .attr("stroke-width", 1.4)
    .attr("marker-end", "url(#arrow)");

  const linkLabelEls = zoomG.selectAll(".link-label-text")
    .data(rawLinks).enter()
    .append("text")
    .attr("class", "link-label-text")
    .attr("text-anchor", "middle")
    .attr("dy", -5)
    .text(function (d) { return d.type; });

  // Click vs drag: a press that moves under 4px counts as a click.
  let moved = false, sx = 0, sy = 0;
  const dragBehavior = d3.drag()
    .on("start", function (event, d) {
      moved = false; sx = event.x; sy = event.y;
      if (!event.active) sim.alphaTarget(0.25).restart();
      d.fx = d.x; d.fy = d.y;
    })
    .on("drag", function (event, d) {
      if (Math.hypot(event.x - sx, event.y - sy) > 4) moved = true;
      d.fx = event.x; d.fy = event.y;
    })
    .on("end", function (event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null; d.fy = null;
      if (!moved) selectNode(this, d);
    });

  function selectNode(el, d) {
    d3.selectAll(".node-card").classed("selected", false);
    d3.select(el).classed("selected", true);
    window.parent.postMessage({
      type: "NODE_CLICK",
      node: { id: d.id, label: d.label, properties: d.properties }
    }, "*");
  }

  function deselect() {
    d3.selectAll(".node-card").classed("selected", false);
    window.parent.postMessage({ type: "NODE_DESELECT" }, "*");
  }

  const cardEls = cards.selectAll(".node-card")
    .data(rawNodes).enter()
    .append("div")
    .attr("class", "node-card")
    .each(function (d) {
      const col = labelColors[d.label] || { bg: "#f4f4f5", border: "#d4d4d8", text: "#52525b" };
      const card = d3.select(this);
      card.append("div").attr("class", "node-accent").style("background", col.border);
      card.append("div").attr("class", "node-name")
        .text(d.properties.name || d.properties.title || d.label);
      card.append("span").attr("class", "node-tag")
        .style("background", col.bg)
        .style("color", col.text)
        .text(d.label);
    })
    .call(dragBehavior);

  const sim = d3.forceSimulation(rawNodes)
    .force("charge",  d3.forceManyBody().strength(charge))
    .force("link",    d3.forceLink(rawLinks).id(function (d) { return d.id; }).distance(linkDist))
    .force("collide", d3.forceCollide().radius(collide).strength(0.85))
    .force("center",  d3.forceCenter(W / 2, H / 2))
    // Gentle per-node pull toward the middle. Without this, nodes with no
    // (or few) relationships just get repelled outward by "charge" with
    // nothing to pull them back, so they drift far from the cluster and
    // the view has to zoom way out to fit them — this is what caused the
    // "scattered all over, tiny nodes" look.
    .force("x", d3.forceX(W / 2).strength(0.03))
    .force("y", d3.forceY(H / 2).strength(0.03))
    .stop();

  // Trim a link endpoint back to the border of the node card so
  // arrowheads stay visible instead of hiding underneath the card.
  function edgeOffset(ux, uy) {
    const cx = ux === 0 ? Infinity : CARD_HW / Math.abs(ux);
    const cy = uy === 0 ? Infinity : CARD_HH / Math.abs(uy);
    return Math.min(cx, cy);
  }

  function renderPositions() {
    linkEls.each(function (d) {
      const sxp = d.source.x, syp = d.source.y;
      const txp = d.target.x, typ = d.target.y;
      const dx = txp - sxp, dy = typ - syp;
      const dist = Math.hypot(dx, dy);
      const el = d3.select(this);
      if (dist < 1) {
        el.attr("x1", sxp).attr("y1", syp).attr("x2", sxp).attr("y2", syp);
        return;
      }
      const ux = dx / dist, uy = dy / dist;
      const startTrim = edgeOffset(ux, uy);
      const endTrim   = edgeOffset(ux, uy) + ARROW_GAP;
      if (startTrim + endTrim >= dist) {
        const mx = (sxp + txp) / 2, my = (syp + typ) / 2;
        el.attr("x1", mx).attr("y1", my).attr("x2", mx).attr("y2", my);
        return;
      }
      el.attr("x1", sxp + ux * startTrim)
        .attr("y1", syp + uy * startTrim)
        .attr("x2", txp - ux * endTrim)
        .attr("y2", typ - uy * endTrim);
    });

    linkLabelEls
      .attr("x", function (d) { return (d.source.x + d.target.x) / 2; })
      .attr("y", function (d) { return (d.source.y + d.target.y) / 2; });

    cardEls
      .style("left", function (d) { return (d.x - cardOffX) + "px"; })
      .style("top",  function (d) { return (d.y - cardOffY) + "px"; });
  }

  function fitView(animate) {
    const pad = 120;
    const xs = rawNodes.map(function (n) { return n.x; });
    const ys = rawNodes.map(function (n) { return n.y; });
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    const minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    const gw = (maxX - minX) + pad * 2;
    const gh = (maxY - minY) + pad * 2;
    let scale = Math.min(W / gw, H / gh);
    scale = Math.max(0.35, Math.min(scale, 1.2));
    const tx = (W - scale * (minX + maxX)) / 2;
    const ty = (H - scale * (minY + maxY)) / 2;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
    if (animate) container.transition().duration(420).call(zoom.transform, t);
    else container.call(zoom.transform, t);
  }

  // Node-size steps: card width/padding/font plus matching link-trim and
  // centering offsets. The "A+/A-" buttons cycle through these so every
  // node on screen grows or shrinks together, in sync with its label text.
  const sizeSteps = [
    { w: 150, pad: "8px 11px 7px",   nameFs: "12px",   tagFs: "8.5px", tagPad: "2px 6px",  hw: 80,  hh: 26, offX: 75,  offY: 22 },
    { w: 200, pad: "12px 15px 10px", nameFs: "14.5px", tagFs: "10.5px",tagPad: "3px 8px",  hw: 106, hh: 34, offX: 100, offY: 28 },
    { w: 250, pad: "15px 19px 13px", nameFs: "17px",   tagFs: "12px",  tagPad: "4px 10px", hw: 131, hh: 42, offX: 125, offY: 34 },
    { w: 300, pad: "18px 22px 16px", nameFs: "19px",   tagFs: "13px",  tagPad: "4px 11px", hw: 156, hh: 50, offX: 150, offY: 40 },
    { w: 360, pad: "21px 26px 19px", nameFs: "22px",   tagFs: "14.5px",tagPad: "5px 13px", hw: 186, hh: 58, offX: 180, offY: 46 },
    { w: 430, pad: "25px 30px 22px", nameFs: "26px",   tagFs: "16px",  tagPad: "5px 15px", hw: 221, hh: 68, offX: 215, offY: 54 },
  ];
  let sizeIndex = 1; // matches the CSS defaults set on #cards above

  function applySize(idx) {
    idx = Math.max(0, Math.min(sizeSteps.length - 1, idx));
    if (idx === sizeIndex) return;
    sizeIndex = idx;
    const step = sizeSteps[sizeIndex];
    const cardsEl = document.getElementById("cards");
    cardsEl.style.setProperty("--card-w", step.w + "px");
    cardsEl.style.setProperty("--card-pad", step.pad);
    cardsEl.style.setProperty("--name-fs", step.nameFs);
    cardsEl.style.setProperty("--tag-fs", step.tagFs);
    cardsEl.style.setProperty("--tag-pad", step.tagPad);
    CARD_HW = step.hw;
    CARD_HH = step.hh;
    cardOffX = step.offX;
    cardOffY = step.offY;
    sim.force("collide").radius(collide * (step.w / sizeSteps[1].w));
    sim.alpha(0.3).restart();
    setTimeout(function () { sim.stop(); fitView(true); }, 380);
  }

  // Settle the layout BEFORE first paint so nothing flies around on screen.
  const preTicks = Math.min(420, 140 + rawNodes.length * 5);
  for (let i = 0; i < preTicks; i++) sim.tick();

  renderPositions();
  fitView(false);
  sim.on("tick", renderPositions); // keeps drag physics live afterwards

  // Legend.
  const legend = document.getElementById("legend");
  if (legend) {
    Object.keys(labelColors).forEach(function (label) {
      const item = document.createElement("span");
      item.className = "legend-item";
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = labelColors[label].border;
      const txt = document.createElement("span");
      txt.textContent = label;
      item.appendChild(dot);
      item.appendChild(txt);
      legend.appendChild(item);
    });
  }

  // Node-size controls.
  const sizeUp = document.getElementById("sizeUp");
  const sizeDown = document.getElementById("sizeDown");
  if (sizeUp)   sizeUp.addEventListener("click",   function () { applySize(sizeIndex + 1); });
  if (sizeDown) sizeDown.addEventListener("click", function () { applySize(sizeIndex - 1); });

  // Zoom controls.
  const zin = document.getElementById("zin");
  const zout = document.getElementById("zout");
  const zfit = document.getElementById("zfit");
  if (zin)  zin.addEventListener("click",  function () { container.transition().duration(200).call(zoom.scaleBy, 1.35); });
  if (zout) zout.addEventListener("click", function () { container.transition().duration(200).call(zoom.scaleBy, 1 / 1.35); });
  if (zfit) zfit.addEventListener("click", function () { fitView(true); });

  // Deselect on background click or Escape.
  document.getElementById("container").addEventListener("click", function (e) {
    if (e.target.id === "container" || e.target.id === "svg" || e.target.tagName === "svg") deselect();
  });
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") deselect();
  });

  // Fade the hint away.
  setTimeout(function () {
    const h = document.getElementById("hint");
    if (h) h.style.opacity = "0";
  }, 3800);
}
</script>
<script>
// Reveal the (already settled) scene. Lives in its own script block so the
// page still becomes visible even if the main graph script throws.
requestAnimationFrame(function () { document.body.classList.add("ready"); });
</script>
</body>
</html>`;
};
