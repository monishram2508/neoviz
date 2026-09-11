import React, { useEffect, useState, useCallback, useRef } from "react";
import "./CypherQueryTester.css";
import { useLocation, useNavigate } from "react-router-dom";
import { buildResultsPageContent } from "./utils/buildResultsPageContent";
import { runCypherQuery } from "./utils/cypherQueryApi";

// Root query for a label: sample nodes of that label plus their direct
// relationships, so the starting view shows real structure.
const rootQueryFor = (label) =>
  `MATCH (n:\`${label}\`) WITH n LIMIT 15 OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m`;

// Neo4j integers arrive as { low, high } objects — render them as numbers.
const formatValue = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if (typeof v.low === "number" && typeof v.high === "number") return String(v.low);
    if (Array.isArray(v)) return v.map(formatValue).join(", ");
    return JSON.stringify(v);
  }
  return String(v);
};

// Panel color chip matching the graph palette.
const PALETTE = [
  { bg: "#e0f2fe", text: "#0369a1" },
  { bg: "#dcfce7", text: "#15803d" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#f3e8ff", text: "#7e22ce" },
  { bg: "#ffe4e6", text: "#9f1239" },
  { bg: "#ffedd5", text: "#c2410c" },
];

const labelChip = (label) => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

const Chevron = ({ dir }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path
      d={dir === "left" ? "M6.5 1.5 L3 5 L6.5 8.5" : "M3.5 1.5 L7 5 L3.5 8.5"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function CypherQueryTester() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const uri      = state?.uri      || sessionStorage.getItem("neo4j_uri")      || "";
  const username = state?.username || sessionStorage.getItem("neo4j_username") || "";
  const password = state?.password || sessionStorage.getItem("neo4j_password") || "";

  const startLabel = state?.selectedNode?.label || localStorage.getItem("nodeLabel") || "";

  // Label list: router state first, then the sessionStorage copy (survives refresh).
  const storedLabels = (() => {
    try { return JSON.parse(sessionStorage.getItem("neo4j_labels") || "[]"); }
    catch { return []; }
  })();
  const allLabels = state?.allLabels?.length ? state.allLabels
    : storedLabels.length ? storedLabels
    : startLabel ? [startLabel] : [];

  const [label,           setLabel]           = useState(startLabel);
  const [navStack,        setNavStack]        = useState(
    startLabel ? [{ label: startLabel, cypher: rootQueryFor(startLabel) }] : []
  );
  const [graphHtml,       setGraphHtml]       = useState("");
  const [loading,         setLoading]         = useState(false);
  const [selectedNode,    setSelectedNode]    = useState(null);
  const [panelCollapsed,  setPanelCollapsed]  = useState(
    () => localStorage.getItem("neoviz_panel_collapsed") === "1"
  );
  const [nlQuestion,      setNlQuestion]      = useState("");
  const [generatedCypher, setGeneratedCypher] = useState("");
  const [generatedQid,    setGeneratedQid]    = useState("");
  const [nlLoading,       setNlLoading]       = useState(false);
  const [error,           setError]           = useState(null);
  const [queryHistory,    setQueryHistory]    = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("neoviz_query_history") || "[]"); }
    catch { return []; }
  });
  const [queryCounter,    setQueryCounter]    = useState(() => {
    try { return Number(sessionStorage.getItem("neoviz_query_counter") || "0"); }
    catch { return 0; }
  });

  const didInit = useRef(false);

  const host = uri
    ? uri.replace(/^neo4j(\+s{1,2}c?)?:\/\//, "").replace(/^bolt(\+s{1,2}c?)?:\/\//, "").split("/")[0]
    : "";

  const fetchAndRender = useCallback(async (cypher) => {
    if (!uri) return;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setGeneratedCypher("");
    setGeneratedQid("");
    try {
      const data = await runCypherQuery({ cypher, uri, username, password });
      if (data?.error) { setError(data.error); setGraphHtml(""); return; }
      setGraphHtml(buildResultsPageContent(Array.isArray(data) ? data : []));
    } catch {
      setError("Failed to reach the backend. Is it running on port 3001?");
    } finally {
      setLoading(false);
    }
  }, [uri, username, password]);

  // No credentials / no label → send the user back to configuration.
  useEffect(() => {
    if (!uri || !startLabel) navigate("/configuration");
  }, [uri, startLabel, navigate]);

  // Initial load.
  useEffect(() => {
    if (didInit.current || !startLabel || !uri) return;
    didInit.current = true;
    fetchAndRender(rootQueryFor(startLabel));
  }, [fetchAndRender, startLabel, uri]);

  // Messages from the graph iframe.
  useEffect(() => {
    const handle = (event) => {
      if (event.data?.type === "NODE_CLICK") {
        setSelectedNode(event.data.node);
        setPanelCollapsed(false);
        localStorage.setItem("neoviz_panel_collapsed", "0");
      }
      if (event.data?.type === "NODE_DESELECT") setSelectedNode(null);
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  // Escape clears the selection (when focus is on the parent page).
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setSelectedNode(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePanel = () => {
    setPanelCollapsed((p) => {
      localStorage.setItem("neoviz_panel_collapsed", p ? "0" : "1");
      return !p;
    });
  };

  const pushAndLoad = (entry) => {
    setNavStack((prev) => [...prev, entry]);
    fetchAndRender(entry.cypher);
  };

  const jumpTo = (index) => {
    const entry = navStack[index];
    setNavStack((prev) => prev.slice(0, index + 1));
    fetchAndRender(entry.cypher);
  };

  const resetToRoot = () => {
    if (!navStack.length) return;
    setNavStack((prev) => [prev[0]]);
    fetchAndRender(navStack[0].cypher);
  };

  const switchLabel = (newLabel) => {
    setLabel(newLabel);
    localStorage.setItem("nodeLabel", newLabel);
    const root = { label: newLabel, cypher: rootQueryFor(newLabel) };
    setNavStack([root]);
    fetchAndRender(root.cypher);
  };

  const handleExpand = () => {
    if (!selectedNode) return;
    const name = selectedNode.properties?.name || selectedNode.properties?.title || selectedNode.label;
    const safeName = String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    pushAndLoad({
      label: String(name),
      cypher: `MATCH (n {name: "${safeName}"})-[r]-(m) RETURN n, r, m LIMIT 30`,
    });
  };

  const runNLQuery = async (question) => {
    const q = (question ?? nlQuestion).trim();
    if (!q || nlLoading) return;
    setNlLoading(true);
    setError(null);
    setGeneratedCypher("");
    setGeneratedQid("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3001/nl-query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: q, uri, username, password, nodeLabel: label }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "The query failed. Try rephrasing your question.");
        if (data.cypher) setGeneratedCypher(data.cypher);
        return;
      }
      const nextCount = queryCounter + 1;
      const qid = "Q" + String(nextCount).padStart(3, "0");
      setQueryCounter(nextCount);
      sessionStorage.setItem("neoviz_query_counter", String(nextCount));

      setGeneratedCypher(data.cypher);
      setGeneratedQid(qid);
      setNavStack((prev) => [...prev, { label: qid, fullLabel: q, cypher: data.cypher, type: "query" }]);
      setGraphHtml(buildResultsPageContent(Array.isArray(data.data) ? data.data : []));
      setSelectedNode(null);
      setNlQuestion("");
      setQueryHistory((prev) => {
        const next = [{ id: qid, question: q, cypher: data.cypher, ts: Date.now() }, ...prev].slice(0, 25);
        sessionStorage.setItem("neoviz_query_history", JSON.stringify(next));
        return next;
      });
    } catch {
      setError("Failed to reach the backend. Is it running on port 3001?");
    } finally {
      setNlLoading(false);
    }
  };

  const clearHistory = () => {
    setQueryHistory([]);
    sessionStorage.removeItem("neoviz_query_history");
    setQueryCounter(0);
    sessionStorage.removeItem("neoviz_query_counter");
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.clear();
    navigate("/login");
  };

  const suggestions = label ? [
    `Show all ${label} nodes and their connections`,
    `Which ${label} has the most relationships?`,
    `Show 10 ${label} nodes connected to something`,
  ] : [];

  const nodeName = selectedNode
    ? formatValue(selectedNode.properties?.name ?? selectedNode.properties?.title ?? selectedNode.label)
    : "";
  const chip = selectedNode ? labelChip(selectedNode.label) : null;

  return (
    <div className="graph-root">

      {/* ── NAVBAR ── */}
      <div className="graph-navbar">
        <div className="nav-brand">
          <span className="nav-brand-mark">⬡</span>
          <span className="nav-brand-name">NEOVIZ</span>
        </div>

        <div className="nav-divider" />

        {allLabels.length > 1 && (
          <select
            className="label-select"
            value={label}
            onChange={(e) => switchLabel(e.target.value)}
            title="Switch node type"
          >
            {allLabels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}

        <div className="breadcrumb">
          {navStack.map((entry, i) => (
            <React.Fragment key={i}>
              <span
                className={`breadcrumb-item${i === navStack.length - 1 ? " active" : ""}${entry.type === "query" ? " query-tag" : ""}`}
                onClick={() => i < navStack.length - 1 && jumpTo(i)}
                title={entry.fullLabel || entry.label}
              >
                {entry.label}
              </span>
              {i < navStack.length - 1 && <span className="breadcrumb-sep">›</span>}
            </React.Fragment>
          ))}
        </div>

        <div className="conn-pill" title={uri}>
          <span className={`conn-pill-dot${uri ? "" : " offline"}`} />
          <span className="conn-pill-host">{host || "not connected"}</span>
        </div>

        <div className="nav-actions">
          {navStack.length > 1 && (
            <button className="nav-btn" onClick={resetToRoot} title="Back to the starting graph">
              ↺ Reset
            </button>
          )}
          <button
            className="nav-btn"
            onClick={() => navigate("/configuration", { state: { forceForm: true } })}
          >
            Change DB
          </button>
          <button className="nav-btn danger" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {/* ── BODY ── */}
      <div className="graph-body">

        {/* GRAPH */}
        <div className="graph-panel">
          {loading && (
            <div className="graph-loading">
              <div className="spinner" />
              <span className="graph-loading-text">Running query…</span>
            </div>
          )}
          {!loading && !graphHtml && (
            <div className="graph-placeholder">
              <span className="graph-placeholder-icon">⬡</span>
              <span className="graph-placeholder-text">
                {error ? "The query didn't return a graph." : "Run a query to see the graph."}
              </span>
            </div>
          )}
          {!loading && graphHtml && (
            <iframe
              className="graph-iframe"
              srcDoc={graphHtml}
              title="Graph visualization"
              sandbox="allow-scripts"
            />
          )}
        </div>

        {/* TOGGLE TAB — outside the panel so it never gets clipped */}
        <button
          className="panel-toggle"
          style={{ right: panelCollapsed ? 0 : "var(--panel-w)" }}
          onClick={togglePanel}
          title={panelCollapsed ? "Show panel" : "Hide panel"}
          aria-label={panelCollapsed ? "Show panel" : "Hide panel"}
        >
          <Chevron dir={panelCollapsed ? "left" : "right"} />
        </button>

        {/* RIGHT PANEL */}
        <div className={`right-panel${panelCollapsed ? " collapsed" : ""}`}>
          <div className="panel-inner">

            {selectedNode ? (
              <>
                <div className="node-detail-head">
                  <span
                    className="node-detail-label"
                    style={{ background: chip.bg, color: chip.text }}
                  >
                    {selectedNode.label}
                  </span>
                  <button
                    className="node-detail-close"
                    onClick={() => setSelectedNode(null)}
                    title="Clear selection (Esc)"
                  >
                    ✕
                  </button>
                </div>

                <div className="node-detail-name">{nodeName}</div>

                <div className="node-props">
                  {Object.entries(selectedNode.properties || {})
                    .filter(([k]) => k !== "id" && k !== "image_data")
                    .slice(0, 8)
                    .map(([key, val]) => {
                      const text = formatValue(val);
                      return (
                        <div className="node-prop" key={key}>
                          <span className="node-prop-key">{key}</span>
                          <span className="node-prop-value">
                            {text.length > 260 ? text.slice(0, 260) + "…" : text}
                          </span>
                        </div>
                      );
                    })}
                </div>

                <button className="expand-btn" onClick={handleExpand}>
                  Expand connections →
                </button>

                <div className="panel-divider" />
                <p className="panel-section-label">Ask a question</p>
              </>
            ) : (
              <>
                <p className="panel-section-label">Ask your database</p>
                <p className="panel-hint">
                  Type a question in plain English — it's translated to Cypher and run
                  live. Or click any node in the graph to inspect it.
                </p>
              </>
            )}

            <textarea
              className="nl-textarea"
              rows={3}
              placeholder={label ? `e.g. "Show ${label} nodes that…"` : "Ask a question…"}
              value={nlQuestion}
              onChange={(e) => setNlQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runNLQuery(); }
              }}
            />
            <button className="run-btn" onClick={() => runNLQuery()} disabled={nlLoading}>
              {nlLoading && <span className="btn-spinner" />}
              {nlLoading ? "Thinking…" : "Run query"}
            </button>
            <p className="kbd-hint"><kbd>Enter</kbd> to run · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line</p>

            {error && <div className="panel-error">{error}</div>}

            {generatedCypher && (
              <div className="cypher-preview">
                <div className="cypher-preview-label">
                  Generated Cypher{generatedQid && <span className="qid-tag">{generatedQid}</span>}
                </div>
                <div className="cypher-code">{generatedCypher}</div>
              </div>
            )}

            {!selectedNode && !generatedCypher && suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={() => { setNlQuestion(s); runNLQuery(s); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {queryHistory.length > 0 && (
              <>
                <div className="panel-divider" />
                <div className="history-header">
                  <p className="panel-section-label" style={{ marginBottom: 0 }}>
                    Recent questions
                  </p>
                  <button className="clear-history-btn" onClick={clearHistory}>
                    Clear
                  </button>
                </div>
                <div className="history-list">
                  {queryHistory.map((h, i) => (
                    <button
                      key={h.ts + "_" + i}
                      className="history-item"
                      title={h.cypher}
                      onClick={() => runNLQuery(h.question)}
                    >
                      {h.id && <span className="qid-tag">{h.id}</span>}
                      <span className="history-item-text">{h.question}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}

export default CypherQueryTester;
