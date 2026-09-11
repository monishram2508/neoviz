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
  const seen  = new Set();

  if (!Array.isArray(data)) return "";

  data.forEach((item) => {
    Object.values(item).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      if (entry.startNodeElementId && entry.endNodeElementId && entry.type) {
        links.push({
          id:     entry.elementId,
          source: entry.startNodeElementId,
          target: entry.endNodeElementId,
          type:   entry.type,
        });
      } else if (entry.elementId && entry.labels && entry.properties) {
        if (!seen.has(entry.elementId)) {
          seen.add(entry.elementId);
          nodes.push({
            id:         entry.elementId,
            label:      entry.labels[0] || "Node",
            properties: entry.properties,
          });
        }
      }
    });
  });

  // Drop links whose endpoints aren't in the node set (from OPTIONAL MATCH nulls)
  const validLinks = links.filter((l) => seen.has(l.source) && seen.has(l.target));

  const colorsJson = JSON.stringify(
    nodes.reduce((acc, n) => { acc[n.label] = getLabelColor(n.label); return acc; }, {})
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Inter', sans-serif;
    background: #f9fafb; overflow: hidden;
    width: 100vw; height: 100vh;
    opacity: 0; transition: opacity 0.5s ease;
  }
  body.ready { opacity: 1; }
  #container { width: 100%; height: 100%; position: relative; overflow: hidden; cursor: grab; }
  #container:active { cursor: grabbing; }
  #cards {
    position: absolute; top: 0; left: 0; width: 0; height: 0;
    transform-origin: 0 0; pointer-events: none;
  }
  .node-card {
    position: absolute; background: #fff; border-radius: 10px;
    padding: 11px 13px; cursor: pointer; width: 180px;
    box-shadow: 0 1px 5px rgba(0,0,0,0.09);
    border-left: 4px solid #e5e7eb;
    transition: box-shadow 0.15s, transform 0.1s;
    user-select: none; pointer-events: all;
  }
  .node-card:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.14); transform: translateY(-2px); }
  .node-card.selected { box-shadow: 0 0 0 2.5px #2563eb, 0 6px 16px rgba(0,0,0,0.12); }
  .node-name {
    font-size: 14px; font-weight: 600; color: #111827;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;
  }
  .node-label-tag {
    font-size: 10px; font-weight: 700; letter-spacing: 0.07em;
    color: #9ca3af; text-transform: uppercase;
  }
  .link-label-text {
    font-size: 11px; font-weight: 500; fill: #6b7280;
    pointer-events: none; font-family: -apple-system, sans-serif;
    paint-order: stroke; stroke: #f9fafb; stroke-width: 3.5px; stroke-linejoin: round;
  }
  .hint {
    position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
    background: rgba(17,24,39,0.72); color: #fff; font-size: 11px;
    padding: 6px 12px; border-radius: 6px; white-space: nowrap;
    pointer-events: none; transition: opacity 0.6s; font-family: -apple-system, sans-serif;
  }
  .empty {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    color: #9ca3af; font-size: 13px; font-family: -apple-system, sans-serif;
  }
</style>
<script src="https://d3js.org/d3.v6.min.js"></script>
</head>
<body>
<div id="container">
  <svg id="svg" style="position:absolute;top:0;left:0;width:100%;height:100%;"></svg>
  <div id="cards"></div>
  ${nodes.length === 0 ? '<div class="empty">No nodes returned for this query.</div>' : ''}
  <div class="hint" id="hint">Click a node for details &nbsp;·&nbsp; Drag to move &nbsp;·&nbsp; Scroll to zoom</div>
</div>
<script>
const rawNodes    = ${JSON.stringify(nodes)};
const rawLinks    = ${JSON.stringify(validLinks)};
const labelColors = ${colorsJson};

const W = window.innerWidth;
const H = window.innerHeight;
const nodeCount = Math.max(rawNodes.length, 1);
const area      = (W * H) / nodeCount;
const charge    = -Math.max(400, Math.min(1400, area / 22));
const linkDist  = Math.max(150, Math.min(320, Math.sqrt(area) * 1.0));
const collide   = Math.max(95, Math.min(130, Math.sqrt(area) * 0.13));

rawNodes.forEach(n => {
  if (!Number.isFinite(n.x)) { n.x = W/2 + (Math.random()-0.5)*300; n.y = H/2 + (Math.random()-0.5)*300; }
});

const svg   = d3.select("#svg");
const zoomG = svg.append("g");
const cards = d3.select("#cards");

const zoom = d3.zoom()
  .scaleExtent([0.15, 3])
  .on("zoom", (e) => {
    zoomG.attr("transform", e.transform);
    cards.style("transform",
      "translate(" + e.transform.x + "px," + e.transform.y + "px) scale(" + e.transform.k + ")");
  });

d3.select("#container").call(zoom);

// Links
const linkEls = zoomG.selectAll("line")
  .data(rawLinks).enter().append("line")
  .attr("stroke", "#cbd5e1").attr("stroke-width", 1.5);

const linkLabelEls = zoomG.selectAll(".link-label-text")
  .data(rawLinks).enter().append("text")
  .attr("class", "link-label-text")
  .attr("text-anchor", "middle").attr("dy", -3)
  .text(d => d.type);

// Click / drag discrimination: a drag that barely moves counts as a click.
let moved = false, sx = 0, sy = 0;
const dragBehavior = d3.drag()
  .on("start", function (event, d) {
    moved = false; sx = event.x; sy = event.y;
    if (!event.active) sim.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  })
  .on("drag", function (event, d) {
    if (Math.hypot(event.x - sx, event.y - sy) > 4) moved = true;
    d.fx = event.x; d.fy = event.y;
  })
  .on("end", function (event, d) {
    if (!event.active) sim.alphaTarget(0);
    d.fx = null; d.fy = null;
    if (!moved) {
      d3.selectAll(".node-card").classed("selected", false);
      d3.select(this).classed("selected", true);
      window.parent.postMessage({
        type: "NODE_CLICK",
        node: { id: d.id, label: d.label, properties: d.properties }
      }, "*");
    }
  });

const cardEls = cards.selectAll(".node-card")
  .data(rawNodes).enter().append("div")
  .attr("class", "node-card")
  .each(function (d) {
    const col = labelColors[d.label] || { bg: "#f3f4f6", border: "#d1d5db", text: "#374151" };
    d3.select(this).style("background", col.bg).style("border-left-color", col.border);
    d3.select(this).append("div").attr("class", "node-name")
      .text(d.properties.name || d.properties.title || d.label);
    d3.select(this).append("div").attr("class", "node-label-tag")
      .style("color", col.text).text(d.label);
  })
  .call(dragBehavior);

const sim = d3.forceSimulation(rawNodes)
  .force("charge",  d3.forceManyBody().strength(charge))
  .force("link",    d3.forceLink(rawLinks).id(d => d.id).distance(linkDist))
  .force("collide", d3.forceCollide().radius(collide).strength(0.85))
  .force("center",  d3.forceCenter(W / 2, H / 2))
  .stop(); // don't animate on screen — we settle it first, below

function render() {
  linkEls
    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
  linkLabelEls
    .attr("x", d => (d.source.x + d.target.x) / 2)
    .attr("y", d => (d.source.y + d.target.y) / 2);
  cardEls
    .style("left", d => (d.x - 90) + "px")
    .style("top",  d => (d.y - 26) + "px");
}

// Fit all nodes into view.
function fitView(animate) {
  if (!rawNodes.length) return;
  const pad = 110;
  const xs = rawNodes.map(n => n.x), ys = rawNodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const gw = (maxX - minX) + pad * 2, gh = (maxY - minY) + pad * 2;
  let scale = Math.min(W / gw, H / gh);
  scale = Math.max(0.5, Math.min(scale, 1.05));
  const tx = (W - scale * (minX + maxX)) / 2;
  const ty = (H - scale * (minY + maxY)) / 2;
  const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
  const sel = d3.select("#container");
  if (animate) sel.transition().duration(400).call(zoom.transform, t);
  else sel.call(zoom.transform, t);
}

// Pre-settle the layout off-screen so it doesn't fly around on first paint.
const preTicks = Math.min(400, 120 + rawNodes.length * 4);
for (let i = 0; i < preTicks; i++) sim.tick();

render();
fitView(false);

// Keep drag interactive (neighbours react) via the tick handler.
sim.on("tick", render);

// Fade the settled graph in.
requestAnimationFrame(() => { document.body.classList.add("ready"); });

setTimeout(() => { const h = document.getElementById("hint"); if (h) h.style.opacity = "0"; }, 3500);

// Click empty space to deselect
document.getElementById("container").addEventListener("click", (e) => {
  if (e.target.id === "container" || e.target.id === "svg" || e.target.tagName === "svg") {
    d3.selectAll(".node-card").classed("selected", false);
    window.parent.postMessage({ type: "NODE_DESELECT" }, "*");
  }
});
</script>
</body>
</html>`;
};
