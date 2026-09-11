import React, { useEffect, useState, useCallback } from "react";
import "./CypherQueryTester.css";
import { useLocation, useNavigate } from "react-router-dom";
import { buildResultsPageContent } from "./utils/buildResultsPageContent";
import { runCypherQuery } from "./utils/cypherQueryApi";

// Root query for a label: take the first 15 of that label, then pull their
// direct relationships so the starting view actually shows connections.
const rootQueryFor = (label) =>
  `MATCH (n:\`${label}\`) WITH n LIMIT 15 OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m`;

function CypherQueryTester() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const uri      = state?.uri      || sessionStorage.getItem("neo4j_uri")      || localStorage.getItem("neo4j_uri")      || "";
  const username = state?.username || sessionStorage.getItem("neo4j_username") || localStorage.getItem("neo4j_username") || "";
  const password = state?.password || sessionStorage.getItem("neo4j_password") || localStorage.getItem("neo4j_password") || "";

  const startLabel = state?.selectedNode?.label || localStorage.getItem("nodeLabel") || "Author";
  const allLabels  = state?.allLabels || (startLabel ? [startLabel] : []);

  const [label,         setLabel]         = useState(startLabel);
  const [navStack,      setNavStack]      = useState([{ label: startLabel, cypher: rootQueryFor(startLabel) }]);
  const [graphHtml,     setGraphHtml]     = useState("");
  const [loading,       setLoading]       = useState(false);
  const [selectedNode,  setSelectedNode]  = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [nlQuestion,    setNlQuestion]    = useState("");
  const [generatedCypher, setGeneratedCypher] = useState("");
  const [nlLoading,     setNlLoading]     = useState(false);
  const [error,         setError]         = useState(null);

  const fetchAndRender = useCallback(async (cypher) => {
    if (!uri) return;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setGeneratedCypher("");
    try {
      const data = await runCypherQuery({ cypher, uri, username, password });
      if (data?.error) { setError(data.error); setGraphHtml(""); return; }
      setGraphHtml(buildResultsPageContent(Array.isArray(data) ? data : []));
    } catch {
      setError("Failed to reach backend.");
    } finally {
      setLoading(false);
    }
  }, [uri, username, password]);

  useEffect(() => { fetchAndRender(navStack[0].cypher); /* eslint-disable-next-line */ }, [fetchAndRender]);

  // Receive node click / deselect from the iframe
  useEffect(() => {
    const handle = (event) => {
      if (event.data?.type === "NODE_CLICK") {
        setSelectedNode(event.data.node);
        setPanelCollapsed(false); // make sure details are visible
      }
      if (event.data?.type === "NODE_DESELECT") setSelectedNode(null);
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  const pushAndLoad = (entry) => {
    setNavStack((prev) => [...prev, entry]);
    fetchAndRender(entry.cypher);
  };

  const jumpTo = (index) => {
    setNavStack((prev) => prev.slice(0, index + 1));
    fetchAndRender(navStack[index].cypher);
  };

  const resetToRoot = () => {
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
    const safeName = String(name).replace(/"/g, '\\"');
    pushAndLoad({
      label: name,
      cypher: `MATCH (n {name: "${safeName}"})-[r]-(m) RETURN n, r, m LIMIT 30`,
    });
  };

  const handleNLQuery = async () => {
    if (!nlQuestion.trim()) return;
    setNlLoading(true);
    setError(null);
    setGeneratedCypher("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3001/nl-query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: nlQuestion, uri, username, password, nodeLabel: label }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Query failed"); return; }
      setGeneratedCypher(data.cypher);
      setNavStack((prev) => [...prev, { label: `"${nlQuestion}"`, cypher: data.cypher }]);
      setGraphHtml(buildResultsPageContent(Array.isArray(data.data) ? data.data : []));
      setSelectedNode(null);
    } catch {
      setError("Failed to reach backend.");
    } finally {
      setNlLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    sessionStorage.clear();
    navigate("/login");
  };

  return (
    <div className="graph-root">

      {/* NAVBAR */}
      <div className="graph-navbar">
        <span className="graph-logo">⬡ NEOVIZ</span>
        <div className="nav-divider" />

        {/* Label picker — choose starting node type */}
        {allLabels.length > 1 && (
          <>
            <select
              className="label-select"
              value={label}
              onChange={(e) => switchLabel(e.target.value)}
              title="Choose which node type to explore"
            >
              {allLabels.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <div className="nav-divider" />
          </>
        )}

        {/* Breadcrumb */}
        <div className="breadcrumb">
          {navStack.map((entry, i) => (
            <React.Fragment key={i}>
              <span
                className={`breadcrumb-item${i === navStack.length - 1 ? " active" : ""}`}
                onClick={() => i < navStack.length - 1 && jumpTo(i)}
                title={entry.label}
              >
                {entry.label}
              </span>
              {i < navStack.length - 1 && <span className="breadcrumb-sep">›</span>}
            </React.Fragment>
          ))}
        </div>

        <div className="nav-actions">
          {navStack.length > 1 && (
            <button className="nav-btn" onClick={resetToRoot}>↺ Reset</button>
          )}
          <button className="nav-btn" onClick={() => navigate("/configuration", { state: { forceForm: true } })}>Change DB</button>
          <button className="nav-btn danger" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* BODY */}
      <div className="graph-body">

        {/* GRAPH */}
        <div className="graph-panel">
          {loading && <div className="graph-loading"><div className="spinner" /></div>}
          {!loading && !graphHtml && (
            <div className="graph-placeholder">
              <span className="graph-placeholder-icon">⬡</span>
              <span className="graph-placeholder-text">No results to display</span>
            </div>
          )}
          {!loading && graphHtml && (
            <iframe
              className="graph-iframe"
              srcDoc={graphHtml}
              title="Graph"
              sandbox="allow-scripts"
            />
          )}
        </div>

        {/* TOGGLE TAB — always visible, sits at the panel edge */}
        <button
          className="panel-toggle"
          style={{ right: panelCollapsed ? 0 : 300 }}
          onClick={() => setPanelCollapsed((p) => !p)}
          title={panelCollapsed ? "Show panel" : "Hide panel"}
        >
          {panelCollapsed ? "‹" : "›"}
        </button>

        {/* RIGHT PANEL */}
        <div className={`right-panel${panelCollapsed ? " collapsed" : ""}`}>
          <div className="panel-inner">

            {selectedNode ? (
              <>
                <span className="node-detail-label">{selectedNode.label}</span>
                <div className="node-detail-name">
                  {selectedNode.properties?.name || selectedNode.properties?.title || "Node"}
                </div>

                <div className="node-props">
                  {Object.entries(selectedNode.properties || {})
                    .filter(([k]) => k !== "id")
                    .slice(0, 8)
                    .map(([key, val]) => (
                      <div className="node-prop" key={key}>
                        <span className="node-prop-key">{key}</span>
                        <span className="node-prop-value">
                          {String(val).length > 220 ? String(val).slice(0, 220) + "…" : String(val)}
                        </span>
                      </div>
                    ))}
                </div>

                <button className="expand-btn" onClick={handleExpand}>
                  Expand connections →
                </button>
                <button className="clear-btn" onClick={() => setSelectedNode(null)}>
                  Clear selection
                </button>

                <div className="panel-divider" />
                <p className="panel-section-label">Ask a question</p>
              </>
            ) : (
              <>
                <p className="panel-section-label">Natural Language Query</p>
                <p className="panel-hint">
                  Ask a question in plain English, or click any node in the graph to see its
                  details and expand its connections.
                </p>
              </>
            )}

            <textarea
              className="nl-textarea"
              rows={3}
              placeholder='e.g. "Show authors who write in Urdu"'
              value={nlQuestion}
              onChange={(e) => setNlQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNLQuery(); }
              }}
            />
            <button className="run-btn" onClick={handleNLQuery} disabled={nlLoading}>
              {nlLoading ? "Thinking…" : "Run Query →"}
            </button>

            {error && <div className="panel-error">{error}</div>}

            {generatedCypher && (
              <div className="cypher-preview">
                <div className="cypher-preview-label">Generated Cypher</div>
                <div className="cypher-code">{generatedCypher}</div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}

export default CypherQueryTester;
