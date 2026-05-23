import React, { useEffect, useState } from "react";
import "./CypherQueryTester.css";
import { useLocation } from "react-router-dom";
import SimpleSelect from "./components/SimpleSelect";
import { buildResultsPageContent } from "./utils/buildResultsPageContent";
import {
  fetchDynamicMenuOptions as getDynamicMenuOptions,
  fetchFullGraphData,
  runCypherQuery,
} from "./utils/cypherQueryApi";

function CypherQueryTester() {
  const { state } = useLocation();
  const {
    selectedNode = {},
    uri = sessionStorage.getItem("neo4j_uri") || localStorage.getItem("neo4j_uri") || "",
    username = sessionStorage.getItem("neo4j_username") || localStorage.getItem("neo4j_username") || "",
    password = sessionStorage.getItem("neo4j_password") || localStorage.getItem("neo4j_password") || "",
    browseFullGraph = false,
  } = state || {};

  const nodeLabel = selectedNode?.label || localStorage.getItem("nodeLabel");

  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [resultsPageContent, setResultsPageContent] = useState("");
  const [queryType, setQueryType] = useState("");
  const [menuOptions, setMenuOptions] = useState([]);

  // Phase 1 — natural language query state
  const [nlQuestion, setNlQuestion] = useState("");
  const [generatedCypher, setGeneratedCypher] = useState("");
  const [nlLoading, setNlLoading] = useState(false);

  // Derive a short host label from the URI for the status badge
  const dbHost = uri ? uri.replace(/^neo4j\+s?:\/\//, "").split(".")[0] : "disconnected";
  const isConnected = !!uri;

  const fetchDynamicMenuOptions = async () => {
    const options = await getDynamicMenuOptions({ nodeLabel, uri, username, password });
    if (!options) return;
    setMenuOptions(options);
  };

  const generateResultsPage = (data, options = {}) => {
    const htmlContent = buildResultsPageContent(data, options);
    if (!htmlContent) return;
    setResultsPageContent(htmlContent);
  };

  useEffect(() => {
    if (nodeLabel) fetchDynamicMenuOptions();
  }, [nodeLabel]);

  useEffect(() => {
    const handleMessage = async (event) => {
      if (event.data?.type === "UPDATE_LIMIT") {
        const { limit } = event.data;
        try {
          const updatedQuery = query.replace(/LIMIT \d+/i, `LIMIT ${limit}`);
          const data = await runCypherQuery({ cypher: updatedQuery, uri, username, password });
          setResult(data);
          generateResultsPage(data, { allowSelection: browseFullGraph });
        } catch (err) {
          console.error("Error updating limit:", err);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [query, browseFullGraph]);

  useEffect(() => { fetchDynamicMenuOptions(); }, [nodeLabel]);

  useEffect(() => {
    if (browseFullGraph) {
      const fetchFullGraph = async () => {
        try {
          const storedUri = uri || sessionStorage.getItem("neo4j_uri") || localStorage.getItem("neo4j_uri");
          const storedUsername = username || sessionStorage.getItem("neo4j_username") || localStorage.getItem("neo4j_username");
          const storedPassword = password || sessionStorage.getItem("neo4j_password") || localStorage.getItem("neo4j_password");
          const data = await fetchFullGraphData({ uri: storedUri, username: storedUsername, password: storedPassword });
          setResult(data);
          generateResultsPage(data, { allowZoom: true, allowSelection: true });
        } catch (err) {
          setError("Error loading full graph.");
          console.error("Error:", err);
        }
      };
      fetchFullGraph();
    }
  }, [browseFullGraph]);

  const executeQuery = async () => {
    if (!query) { setError("Please select a query."); return; }
    setError(null);
    try {
      const data = await runCypherQuery({ cypher: query, uri, username, password });
      setResult(data);
      generateResultsPage(data);
    } catch (err) {
      setError("Error executing query. Please check the backend.");
      console.error("Error:", err);
    }
  };

  // Phase 1 — NL query handler
  const executeNLQuery = async () => {
    if (!nlQuestion.trim()) { setError("Please type a question."); return; }
    setError(null);
    setNlLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:3001/nl-query", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ question: nlQuestion, uri, username, password, nodeLabel }),
      });
      const res = await response.json();
      if (!response.ok) {
        setError(res.error || "Something went wrong");
        if (res.cypher) setGeneratedCypher(res.cypher);
        return;
      }
      setGeneratedCypher(res.cypher);
      setResult(res.data);
      generateResultsPage(res.data);
    } catch (err) {
      setError("Failed to reach backend.");
      console.error(err);
    } finally {
      setNlLoading(false);
    }
  };

  const handleQueryTypeChange = (e) => {
    const selectedOption = menuOptions.find((opt) => opt.name === e.target.value);
    setQueryType(e.target.value);
    setQuery(selectedOption ? selectedOption.query : "");
  };

  const handleLogout = () => {
    sessionStorage.clear();
    window.location.href = "/";
  };

  return (
    <div
      className="page-container"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        overflow: browseFullGraph ? "auto" : "hidden",
      }}
    >
      <div className="header-box">

        {/* ── ROW 1: brand + connection status + logout ── */}
        <div className="header-text">
          <div className="title">NEOVIZ</div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* connection status */}
            <div className="conn-status">
              <span className={`conn-dot${isConnected ? "" : " offline"}`} />
              {isConnected ? dbHost : "not connected"}
            </div>

            {/* static feature pills */}
            <div className="feature-pills">
              <span className="pill">INTERACTIVE GRAPH</span>
              <span className="pill">NL → CYPHER</span>
              <span className="pill">{browseFullGraph ? "FULL GRAPH" : nodeLabel?.toUpperCase()}</span>
            </div>

            <button onClick={handleLogout} className="logout-btn">LOGOUT</button>
          </div>
        </div>

        {error && <div className="error-box">{error}</div>}

        {/* ── ROW 2: query controls (only in node mode) ── */}
        {!browseFullGraph && (
          <>
            {/* predefined query selector */}
            <div className="query-controls">
              <SimpleSelect
                value={queryType}
                onChange={(val) => {
                  setQueryType(val);
                  const selected = menuOptions.find((o) => o.value === val);
                  if (selected) setQuery(selected.query);
                }}
                options={menuOptions}
              />
              <button onClick={executeQuery} className="visualize-btn">
                VISUALIZE
              </button>
            </div>

            {/* NL query row */}
            <div className="query-controls">
              <div className="nl-input-wrap">
                <span className="nl-prefix">ASK →</span>
                <input
                  className="nl-input"
                  type="text"
                  placeholder='e.g. "Show me all connected nodes"'
                  value={nlQuestion}
                  onChange={(e) => setNlQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && executeNLQuery()}
                />
              </div>
              <button
                onClick={executeNLQuery}
                className="visualize-btn"
                disabled={nlLoading}
              >
                {nlLoading ? "THINKING..." : "RUN"}
              </button>
            </div>

            {/* generated cypher preview */}
            {generatedCypher && (
              <div className="cypher-preview-strip">
                <span className="label">CYPHER</span>
                <span className="code">{generatedCypher}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── GRAPH AREA ── */}
      <div
        className="results-section"
        style={{
          flexGrow: 1,
          width: "100%",
          height: browseFullGraph ? "calc(100vh - 200px)" : "75vh",
          overflowX: browseFullGraph ? "scroll" : "hidden",
          overflowY: browseFullGraph ? "scroll" : "hidden",
        }}
      >
        {resultsPageContent ? (
          <iframe
            srcDoc={resultsPageContent}
            title="Results"
            style={{ width: "100%", height: "100%", border: "none", display: "block", background: "#010D1C" }}
          />
        ) : (
          <div className="results-placeholder">
            <span className="results-placeholder-icon">⬡</span>
            <span>// run a query to render the graph</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default CypherQueryTester;