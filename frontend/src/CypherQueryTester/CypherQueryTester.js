import React, { useEffect, useState, useCallback, useRef } from "react";
import "./CypherQueryTester.css";
import { useLocation, useNavigate } from "react-router-dom";
import { buildResultsPageContent } from "./utils/buildResultsPageContent";
import { runCypherQuery } from "./utils/cypherQueryApi";
import { useTheme } from "../theme";

const rootQueryFor = (label) =>
`MATCH (n:\`${label}\`) WITH n ORDER BY toLower(coalesce(n.name, n.title, "")) LIMIT 15 OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m`;

const KEYWORD_KEYS = ["keywords", "keywordsUrdu"];

const normKey = (s) =>
String(s ?? "").
normalize("NFKC").
replace(/[\u2018\u2019]/g, "'").
replace(/[\u201C\u201D]/g, '"').
replace(/[\u2013\u2014]/g, "-").
replace(/\s+/g, " ").
trim().
replace(/^[.,;:\u060C\u06D4]+|[.,;:\u060C\u06D4]+$/g, "").
toLowerCase();

const asKeywordList = (v) => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((x) => x.trim()).filter(Boolean);
  return [];
};

const keywordsOf = (node) => asKeywordList(node?.properties?.keywords);

const displayKw = (s) => {
  const t = String(s ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

const escapeCypher = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const jumpQueryFor = (name) => {
  const esc = escapeCypher(name);
  return `MATCH (n) WHERE n.name = "${esc}" OR n.title = "${esc}" OPTIONAL MATCH (n)-[r]-(m) RETURN n, r, m LIMIT 40`;
};

const worksWithKeywordsQuery = (kws, mode) => {
  const sel = kws.map((k) => `toLower("${escapeCypher(k)}")`).join(", ");
  const fn = mode === "any" ? "any" : "all";
  return `WITH [${sel}] AS sel
MATCH (w:Work) WHERE w.keywords IS NOT NULL
  AND ${fn}(t IN sel WHERE any(k IN w.keywords WHERE toLower(trim(k)) = t))
OPTIONAL MATCH (a:Author)-[r:WROTE]->(w)
RETURN w, r, a`;
};

const worksFromRecords = (records) => {
  const out = new Map();
  (records || []).forEach((rec) => {
    Object.values(rec || {}).forEach((v) => {
      if (!v || typeof v !== "object" || !Array.isArray(v.labels)) return;
      if (!v.labels.includes("Work")) return;
      const title = String(v.properties?.title ?? "").trim();
      if (!title || out.has(title)) return;
      out.set(title, { title, keywords: asKeywordList(v.properties?.keywords) });
    });
  });
  return [...out.values()];
};

const VOCAB_QUERY = `MATCH (w:Work) WHERE w.keywords IS NOT NULL
UNWIND w.keywords AS raw
WITH trim(raw) AS k, w
WHERE k <> ""
RETURN k AS keyword, count(DISTINCT w) AS works
ORDER BY works DESC, keyword ASC`;

const formatValue = (v) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    if (typeof v.low === "number" && typeof v.high === "number") return String(v.low);
    if (Array.isArray(v)) return v.map(formatValue).join(", ");
    return JSON.stringify(v);
  }
  return String(v);
};

const PALETTE = [
{ bg: "#e0f2fe", text: "#0369a1" },
{ bg: "#dcfce7", text: "#15803d" },
{ bg: "#fef9c3", text: "#854d0e" },
{ bg: "#f3e8ff", text: "#7e22ce" },
{ bg: "#ffe4e6", text: "#9f1239" },
{ bg: "#ffedd5", text: "#c2410c" }];

const labelChip = (label) => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

const Chevron = ({ dir }) =>
<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
    <path
    d={dir === "left" ? "M6.5 1.5 L3 5 L6.5 8.5" : "M3.5 1.5 L7 5 L3.5 8.5"}
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round" />
  
  </svg>;

function CypherQueryTester() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const uri = state?.uri || sessionStorage.getItem("neo4j_uri") || "";
  const username = state?.username || sessionStorage.getItem("neo4j_username") || "";
  const password = state?.password || sessionStorage.getItem("neo4j_password") || "";

  const startLabel = state?.selectedNode?.label || localStorage.getItem("nodeLabel") || "";

  const storedLabels = (() => {
    try {return JSON.parse(sessionStorage.getItem("neo4j_labels") || "[]");}
    catch {return [];}
  })();
  const allLabels = state?.allLabels?.length ? state.allLabels :
  storedLabels.length ? storedLabels :
  startLabel ? [startLabel] : [];

  const [label, setLabel] = useState(startLabel);
  const [navStack, setNavStack] = useState(
    startLabel ? [{ label: startLabel, cypher: rootQueryFor(startLabel) }] : []
  );
  const [graphHtml, setGraphHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(
    () => localStorage.getItem("neoviz_panel_collapsed") === "1"
  );
  const [nlQuestion, setNlQuestion] = useState("");
  const [generatedCypher, setGeneratedCypher] = useState("");
  const [generatedQid, setGeneratedQid] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [error, setError] = useState(null);
  const [queryHistory, setQueryHistory] = useState(() => {
    try {return JSON.parse(sessionStorage.getItem("neoviz_query_history") || "[]");}
    catch {return [];}
  });
  const [queryCounter, setQueryCounter] = useState(() => {
    try {return Number(sessionStorage.getItem("neoviz_query_counter") || "0");}
    catch {return 0;}
  });

  const [tab, setTab] = useState("inspect");
  const [vocab, setVocab] = useState([]);
  const [vocabLoading, setVocabLoading] = useState(false);
  const [kwFilter, setKwFilter] = useState("");
  const [activeKeywords, setActiveKeywords] = useState([]);
  const [kwMode, setKwMode] = useState("all");
  const [resultWorks, setResultWorks] = useState([]);
  const [compare, setCompare] = useState(() => {
    try {return JSON.parse(sessionStorage.getItem("neoviz_compare") || "[]");}
    catch {return [];}
  });
  const [compareViewOn, setCompareViewOn] = useState(false);

  const [theme, toggleTheme] = useTheme();
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);

  const didInit = useRef(false);
  const iframeRef = useRef(null);
  const lastRecordsRef = useRef(null);
  const tabRef = useRef(tab);
  useEffect(() => {tabRef.current = tab;}, [tab]);

  const host = uri ?
  uri.replace(/^neo4j(\+s{1,2}c?)?:\/\//, "").replace(/^bolt(\+s{1,2}c?)?:\/\//, "").split("/")[0] :
  "";

  const themeRef = useRef(theme);
  useEffect(() => {themeRef.current = theme;}, [theme]);
  const compareRef = useRef(compare);
  useEffect(() => {compareRef.current = compare;}, [compare]);
  const activeKeywordsRef = useRef(activeKeywords);
  const kwModeRef = useRef(kwMode);

  const setKws = (kws) => {
    activeKeywordsRef.current = kws;
    setActiveKeywords(kws);
  };

  const renderOpts = () => ({
    theme: themeRef.current,
    compareTitles: compareRef.current.map((c) => c.title)
  });

  const fetchAndRender = useCallback(async (cypher) => {
    if (!uri) return;
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    setGeneratedCypher("");
    setGeneratedQid("");
    setExplanation("");
    setCompareViewOn(false);
    try {
      const data = await runCypherQuery({ cypher, uri, username, password });
      if (data?.error) {setError(data.error);setGraphHtml("");setResultWorks([]);return;}
      const records = Array.isArray(data) ? data : [];
      lastRecordsRef.current = records;
      setResultWorks(worksFromRecords(records));
      setGraphHtml(buildResultsPageContent(records, renderOpts()));
    } catch {
      setError("Failed to reach the backend. Is it running on port 3001?");
    } finally {
      setLoading(false);
    }
  }, [uri, username, password]);

  useEffect(() => {
    if (!uri || !startLabel) navigate("/configuration");
  }, [uri, startLabel, navigate]);

  useEffect(() => {
    if (didInit.current || !startLabel || !uri) return;
    didInit.current = true;
    fetchAndRender(rootQueryFor(startLabel));
  }, [fetchAndRender, startLabel, uri]);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    setVocabLoading(true);
    runCypherQuery({ cypher: VOCAB_QUERY, uri, username, password }).
    then((data) => {
      if (cancelled || !Array.isArray(data)) return;

      const merged = new Map();
      data.forEach((row) => {
        const kw = row?.keyword;
        if (!kw) return;
        const key = normKey(kw);
        if (!key) return;
        const n = typeof row.works === "object" ? row.works?.low ?? 0 : Number(row.works) || 0;
        const prev = merged.get(key);
        if (prev) prev.works = Math.max(prev.works, n);else
        merged.set(key, { keyword: String(kw).trim(), works: n });
      });
      setVocab([...merged.values()].sort(
        (a, b) => b.works - a.works || a.keyword.localeCompare(b.keyword)
      ));
    }).
    catch(() => {}).
    finally(() => {if (!cancelled) setVocabLoading(false);});
    return () => {cancelled = true;};
  }, [uri, username, password]);

  useEffect(() => {
    const handle = (event) => {
      if (event.data?.type === "NODE_CLICK") {
        const node = event.data.node;
        if (tabRef.current === "compare") {
          if (node.label === "Work") toggleCompare(node);
          return;
        }
        setSelectedNode(node);
        setPanelCollapsed(false);
        localStorage.setItem("neoviz_panel_collapsed", "0");
      }
      if (event.data?.type === "NODE_DESELECT") {
        if (tabRef.current !== "compare") setSelectedNode(null);
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "COMPARE_SET", titles: compare.map((c) => c.title) }, "*"
    );
  }, [compare, graphHtml]);

  useEffect(() => {
    if (compareViewOn) {
      setGraphHtml(buildCompareHtml());
    } else if (lastRecordsRef.current) {
      setGraphHtml(buildResultsPageContent(lastRecordsRef.current, renderOpts()));
    }
  }, [theme]);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2 || !uri) {setSearchResults([]);return;}
    const t = setTimeout(async () => {
      const esc = escapeCypher(q.toLowerCase());
      const cy = `MATCH (n) WITH n, toLower(coalesce(n.name, n.title, "")) AS nm WHERE nm CONTAINS "${esc}" RETURN DISTINCT labels(n)[0] AS label, coalesce(n.name, n.title) AS name ORDER BY nm LIMIT 8`;
      try {
        const data = await runCypherQuery({ cypher: cy, uri, username, password });
        if (Array.isArray(data)) {
          setSearchResults(data.filter((r) => r.name).map((r) => ({ label: r.label, name: r.name })));
        }
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ, uri, username, password]);

  useEffect(() => {
    const onKey = (e) => {if (e.key === "Escape") setSelectedNode(null);};
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
    setKws(entry.type === "keyword" ? entry.kws || [] : []);
    fetchAndRender(entry.cypher);
  };

  const resetToRoot = () => {
    if (!navStack.length) return;
    setKws([]);
    setNavStack((prev) => [prev[0]]);
    fetchAndRender(navStack[0].cypher);
  };

  const switchLabel = (newLabel) => {
    setKws([]);
    setLabel(newLabel);
    localStorage.setItem("nodeLabel", newLabel);
    const root = { label: newLabel, cypher: rootQueryFor(newLabel) };
    setNavStack([root]);
    fetchAndRender(root.cypher);
  };

  const handleExpand = () => {
    if (!selectedNode) return;
    setKws([]);
    const name = selectedNode.properties?.name || selectedNode.properties?.title || selectedNode.label;
    const safeName = String(name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    pushAndLoad({
      label: String(name),
      cypher: `MATCH (n {name: "${safeName}"})-[r]-(m) RETURN n, r, m LIMIT 30`
    });
  };

  const keywordEntry = (kws, mode) => ({
    label: kws.length === 1 ? `#${kws[0]}` : `#${kws.length} keywords`,
    fullLabel:
    kws.length === 1 ?
    `Works tagged "${kws[0]}"` :
    `Works tagged ${mode === "any" ? "any of" : "all of"}: ${kws.join(", ")}`,
    cypher: worksWithKeywordsQuery(kws, mode),
    type: "keyword",
    kws
  });

  const applyKeywordFilter = (kws, mode) => {
    setTab("keywords");
    if (!kws.length) {resetToRoot();return;}
    setKws(kws);
    const entry = keywordEntry(kws, mode);
    setNavStack((prev) => {
      const last = prev[prev.length - 1];
      if (prev.length > 1 && last?.type === "keyword") return [...prev.slice(0, -1), entry];
      return [...prev, entry];
    });
    fetchAndRender(entry.cypher);
  };

  const toggleKeyword = (kw) => {
    const clean = String(kw).trim();
    if (!clean) return;
    const key = normKey(clean);
    const prev = activeKeywordsRef.current;
    const exists = prev.some((k) => normKey(k) === key);
    applyKeywordFilter(
      exists ? prev.filter((k) => normKey(k) !== key) : [...prev, clean],
      kwModeRef.current
    );
  };

  const clearKeywords = () => applyKeywordFilter([], kwModeRef.current);

  const switchKwMode = (mode) => {
    kwModeRef.current = mode;
    setKwMode(mode);
    if (activeKeywordsRef.current.length > 1) {
      applyKeywordFilter(activeKeywordsRef.current, mode);
    }
  };

  const toggleCompare = (node) => {
    const title = String(node?.properties?.title ?? "").trim();
    if (!title) return;
    setCompare((prev) => {
      const exists = prev.some((c) => c.title === title);
      const next = exists ?
      prev.filter((c) => c.title !== title) :
      [...prev, {
        title,
        author: node.properties?.author ?? "",
        keywords: asKeywordList(node.properties?.keywords)
      }];
      sessionStorage.setItem("neoviz_compare", JSON.stringify(next));
      return next;
    });
  };

  const removeFromCompare = (title) => {
    setCompare((prev) => {
      const next = prev.filter((c) => c.title !== title);
      sessionStorage.setItem("neoviz_compare", JSON.stringify(next));
      return next;
    });
  };

  const clearCompare = () => {
    setCompare([]);
    sessionStorage.setItem("neoviz_compare", "[]");
  };

  const buildCompareRecords = () => {
    const list = compareRef.current;
    const entries = list.map((c) => ({
      elementId: "cmp:" + c.title,
      labels: ["Work"],
      properties: { title: c.title, author: c.author, keywords: c.keywords }
    }));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i],b = list[j];
        const bKeys = new Set(b.keywords.map(normKey));
        const shared = a.keywords.filter((k) => bKeys.has(normKey(k))).length;
        if (shared > 0) {
          entries.push({
            elementId: `cmpl:${a.title}|${b.title}`,
            startNodeElementId: "cmp:" + a.title,
            endNodeElementId: "cmp:" + b.title,
            type: `${shared} shared`,
            weight: shared,
            undirected: true
          });
        }
      }
    }

    return [Object.fromEntries(entries.map((e, i) => ["e" + i, e]))];
  };

  const buildCompareHtml = () =>
  buildResultsPageContent(buildCompareRecords(), {
    theme: themeRef.current,
    compareTitles: []
  });

  const showOnlySelected = () => {
    if (compareRef.current.length < 2) return;
    setCompareViewOn(true);
    setSelectedNode(null);
    setGraphHtml(buildCompareHtml());
  };

  const backToFullGraph = () => {
    setCompareViewOn(false);
    if (lastRecordsRef.current) {
      setGraphHtml(buildResultsPageContent(lastRecordsRef.current, renderOpts()));
    }
  };

  useEffect(() => {
    if (!compareViewOn) return;
    if (compare.length < 2) {backToFullGraph();return;}
    setGraphHtml(buildCompareHtml());
  }, [compare]);

  useEffect(() => {
    if (tab !== "compare" && compareViewOn) backToFullGraph();
  }, [tab]);

  const jumpToEntity = (name) => {
    setKws([]);
    setSearchQ("");
    setSearchOpen(false);
    setSearchResults([]);
    pushAndLoad({ label: String(name), cypher: jumpQueryFor(name) });
  };

  const summarizeRecords = (records) => {
    const nodesById = {};
    const names = [];
    const seenN = new Set();
    records.forEach((row) => Object.values(row).forEach((e) => {
      if (!e || typeof e !== "object") return;
      if (e.elementId && e.labels && e.properties) {
        nodesById[e.elementId] = e;
        const nm = e.properties.name || e.properties.title;
        if (nm && !seenN.has(nm)) {
          seenN.add(nm);
          names.push(`${nm} (${e.labels[0]})`);
        }
      }
    }));
    const rels = [];
    const seenR = new Set();
    records.forEach((row) => Object.values(row).forEach((e) => {
      if (!e || typeof e !== "object" || !e.startNodeElementId || !e.type) return;
      const s = nodesById[e.startNodeElementId];
      const t = nodesById[e.endNodeElementId];
      if (!s || !t) return;
      const sN = s.properties.name || s.properties.title;
      const tN = t.properties.name || t.properties.title;
      const key = `${sN}|${e.type}|${tN}`;
      if (sN && tN && !seenR.has(key)) {
        seenR.add(key);
        rels.push(`${sN} —${e.type}→ ${tN}`);
      }
    }));
    return `Nodes (${names.length}): ${names.slice(0, 40).join("; ")}\n` +
    `Relationships (${rels.length}): ${rels.slice(0, 40).join("; ")}`;
  };

  const fetchExplanation = async (question, cypher, records) => {
    if (!Array.isArray(records) || records.length === 0) return;
    setExplanation("");
    setExplainLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("http://localhost:3001/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question, cypher, summary: summarizeRecords(records) })
      });
      const d = await res.json();
      if (res.ok && d.explanation) setExplanation(d.explanation);
    } catch {} finally
    {setExplainLoading(false);}
  };

  const renderExplanation = (text) =>
  text.split(/(\[\[.+?\]\])/g).map((part, i) => {
    const m = part.match(/^\[\[(.+)\]\]$/);
    if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
    return (
      <button
        key={i}
        className="explain-entity"
        title={`Show ${m[1]} in the graph`}
        onClick={() => jumpToEntity(m[1])}>
        
          {m[1]}
        </button>);

  });

  const vocabCount = (() => {
    const m = new Map();
    vocab.forEach((v) => m.set(normKey(v.keyword), v.works));
    return m;
  })();

  const hubThreshold = Math.max(3, Math.ceil((vocab[0]?.works || 1) * 0.6));

  const comparison = (() => {
    if (compare.length < 2) return { shared: [], partial: [] };
    const seen = new Map();
    compare.forEach((w) => {
      new Set(w.keywords.map(normKey)).forEach((k) => {
        if (!k) return;
        const original = w.keywords.find((x) => normKey(x) === k) || k;
        if (!seen.has(k)) seen.set(k, { display: original, titles: new Set() });
        seen.get(k).titles.add(w.title);
      });
    });
    const shared = [],partial = [];
    seen.forEach((v, k) => {
      const n = v.titles.size;
      const freq = vocabCount.get(k) ?? n;
      const row = { keyword: v.display, n, freq, hub: freq >= hubThreshold };
      if (n === compare.length) shared.push(row);else
      if (n >= 2) partial.push(row);
    });
    const byRarity = (a, b) => a.freq - b.freq || a.keyword.localeCompare(b.keyword);
    return {
      shared: shared.sort(byRarity),
      partial: partial.sort((a, b) => b.n - a.n || byRarity(a, b))
    };
  })();

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
        body: JSON.stringify({ question: q, uri, username, password, nodeLabel: label })
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
      const records = Array.isArray(data.data) ? data.data : [];
      lastRecordsRef.current = records;
      setResultWorks(worksFromRecords(records));
      setKws([]);
      setCompareViewOn(false);
      setGraphHtml(buildResultsPageContent(records, renderOpts()));
      setSelectedNode(null);
      setNlQuestion("");
      fetchExplanation(q, data.cypher, records);
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
  `Show 10 ${label} nodes connected to something`] :
  [];

  const nodeName = selectedNode ?
  formatValue(selectedNode.properties?.name ?? selectedNode.properties?.title ?? selectedNode.label) :
  "";
  const chip = selectedNode ? labelChip(selectedNode.label) : null;
  const selectedKeywords = keywordsOf(selectedNode);

  const activeKeySet = new Set(activeKeywords.map(normKey));

  const facetCounts = (() => {
    if (!activeKeywords.length || kwMode !== "all" || !resultWorks.length) return null;
    const m = new Map();
    resultWorks.forEach((w) => {
      new Set(w.keywords.map(normKey)).forEach((k) => {
        if (k) m.set(k, (m.get(k) || 0) + 1);
      });
    });
    return m;
  })();

  const filteredVocab = (() => {
    const q = normKey(kwFilter);
    let list = vocab;
    if (facetCounts) {
      list = list.
      filter((v) => facetCounts.has(normKey(v.keyword))).
      map((v) => ({ ...v, works: facetCounts.get(normKey(v.keyword)) }));
    }
    if (q) list = list.filter((v) => normKey(v.keyword).includes(q));
    return [...list].sort((a, b) => {
      const aSel = activeKeySet.has(normKey(a.keyword)) ? 1 : 0;
      const bSel = activeKeySet.has(normKey(b.keyword)) ? 1 : 0;
      if (aSel !== bSel) return bSel - aSel;
      return b.works - a.works || a.keyword.localeCompare(b.keyword);
    }).slice(0, 300);
  })();

  return (
    <div className="graph-root">

      <div className="graph-navbar">
        <div className="nav-brand">
          <span className="nav-brand-mark">⬡</span>
          <span className="nav-brand-name">NEOVIZ</span>
        </div>

        <div className="nav-divider" />

        {allLabels.length > 1 &&
        <select
          className="label-select"
          value={label}
          onChange={(e) => switchLabel(e.target.value)}
          title="Switch node type">
          
            {allLabels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        }

        <div className="breadcrumb">
          {navStack.map((entry, i) =>
          <React.Fragment key={i}>
              <span
              className={`breadcrumb-item${i === navStack.length - 1 ? " active" : ""}${entry.type ? " query-tag" : ""}`}
              onClick={() => i < navStack.length - 1 && jumpTo(i)}
              title={entry.fullLabel || entry.label}>
              
                {entry.label}
              </span>
              {i < navStack.length - 1 && <span className="breadcrumb-sep">›</span>}
            </React.Fragment>
          )}
        </div>

        <div className="nav-search">
          <span className="nav-search-icon">⌕</span>
          <input
            className="nav-search-input"
            placeholder="Find author or work…"
            value={searchQ}
            onChange={(e) => {setSearchQ(e.target.value);setSearchOpen(true);}}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults.length) jumpToEntity(searchResults[0].name);
              if (e.key === "Escape") {setSearchQ("");setSearchOpen(false);}
            }} />
          
          {searchOpen && searchQ.trim().length >= 2 &&
          <div className="nav-search-drop">
              {searchResults.length === 0 ?
            <div className="nav-search-empty">No matches</div> :
            searchResults.map((r) =>
            <button
              key={`${r.label}:${r.name}`}
              className="nav-search-item"
              onMouseDown={(e) => {e.preventDefault();jumpToEntity(r.name);}}>
              
                  <span className="nav-search-name">{r.name}</span>
                  <span className="nav-search-tag">{r.label}</span>
                </button>
            )}
            </div>
          }
        </div>

        <div className="conn-pill" title={uri}>
          <span className={`conn-pill-dot${uri ? "" : " offline"}`} />
          <span className="conn-pill-host">{host || "not connected"}</span>
        </div>

        <div className="nav-actions">
          <button
            className="nav-btn icon-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme">
            
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {navStack.length > 1 &&
          <button className="nav-btn" onClick={resetToRoot} title="Back to the starting graph">
              ↺ Reset
            </button>
          }
          <button
            className="nav-btn"
            onClick={() => navigate("/configuration", { state: { forceForm: true } })}>
            
            Change DB
          </button>
          <button className="nav-btn danger" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      <div className="graph-body">

        <div className="graph-panel">
          {loading &&
          <div className="graph-loading">
              <div className="spinner" />
              <span className="graph-loading-text">Running query…</span>
            </div>
          }
          {!loading && !graphHtml &&
          <div className="graph-placeholder">
              <span className="graph-placeholder-icon">⬡</span>
              <span className="graph-placeholder-text">
                {error ? "The query didn't return a graph." : "Run a query to see the graph."}
              </span>
            </div>
          }
          {!loading && graphHtml &&
          <iframe
            ref={iframeRef}
            className="graph-iframe"
            srcDoc={graphHtml}
            title="Graph visualization"
            sandbox="allow-scripts" />

          }
          {tab === "compare" && !compareViewOn &&
          <div className="compare-mode-banner">
              Compare mode — click a work to add or remove it
            </div>
          }
        </div>

        <button
          className="panel-toggle"
          style={{ right: panelCollapsed ? 0 : "var(--panel-w)" }}
          onClick={togglePanel}
          title={panelCollapsed ? "Show panel" : "Hide panel"}
          aria-label={panelCollapsed ? "Show panel" : "Hide panel"}>
          
          <Chevron dir={panelCollapsed ? "left" : "right"} />
        </button>

        <div className={`right-panel${panelCollapsed ? " collapsed" : ""}`}>
          <div className="panel-inner">

            <div className="panel-tabs">
              {[
              { id: "inspect", text: "Inspect" },
              { id: "keywords", text: "Keywords" },
              { id: "compare", text: `Compare${compare.length ? ` (${compare.length})` : ""}` }].
              map((t) =>
              <button
                key={t.id}
                className={`panel-tab${tab === t.id ? " active" : ""}`}
                onClick={() => setTab(t.id)}>
                
                  {t.text}
                </button>
              )}
            </div>

            {tab === "inspect" && <>

            {selectedNode ?
              <>
                <div className="node-detail-head">
                  <span
                    className="node-detail-label"
                    style={{ background: chip.bg, color: chip.text }}>
                    
                    {selectedNode.label}
                  </span>
                  <button
                    className="node-detail-close"
                    onClick={() => setSelectedNode(null)}
                    title="Clear selection (Esc)">
                    
                    ✕
                  </button>
                </div>

                <div className="node-detail-name">{nodeName}</div>

                <div className="node-props">
                  {Object.entries(selectedNode.properties || {}).
                  filter(([k]) => k !== "id" && k !== "image_data" && !KEYWORD_KEYS.includes(k)).
                  slice(0, 8).
                  map(([key, val]) => {
                    const text = formatValue(val);
                    return (
                      <div className="node-prop" key={key}>
                          <span className="node-prop-key">{key}</span>
                          <span className="node-prop-value">
                            {text.length > 260 ? text.slice(0, 260) + "…" : text}
                          </span>
                        </div>);

                  })}
                </div>

                {selectedKeywords.length > 0 &&
                <div className="kw-block">
                    <div className="kw-block-head">
                      <span className="node-prop-key">keywords</span>
                      <span className="kw-count">{selectedKeywords.length}</span>
                    </div>
                    <div className="kw-chips">
                      {selectedKeywords.map((k) =>
                    <button
                      key={k}
                      className="kw-chip"
                      title={`Show every work tagged "${displayKw(k)}"`}
                      onClick={() => toggleKeyword(k)}>
                      
                          {displayKw(k)}
                        </button>
                    )}
                    </div>
                  </div>
                }

                <button className="expand-btn" onClick={handleExpand}>
                  Expand connections →
                </button>

                <div className="panel-divider" />
                <p className="panel-section-label">Ask a question</p>
              </> :

              <>
                <p className="panel-section-label">Ask your database</p>
                <p className="panel-hint">
                  Type a question in plain English — it's translated to Cypher and run
                  live. Or click any node in the graph to inspect it.
                </p>
              </>
              }

            <textarea
                className="nl-textarea"
                rows={3}
                placeholder={label ? `e.g. "Show ${label} nodes that…"` : "Ask a question…"}
                value={nlQuestion}
                onChange={(e) => setNlQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {e.preventDefault();runNLQuery();}
                }} />
              
            <button className="run-btn" onClick={() => runNLQuery()} disabled={nlLoading}>
              {nlLoading && <span className="btn-spinner" />}
              {nlLoading ? "Thinking…" : "Run query"}
            </button>
            <p className="kbd-hint"><kbd>Enter</kbd> to run · <kbd>Shift</kbd>+<kbd>Enter</kbd> for a new line</p>

            {error && <div className="panel-error">{error}</div>}

            {generatedCypher &&
              <div className="cypher-preview">
                <div className="cypher-preview-label">
                  Generated Cypher{generatedQid && <span className="qid-tag">{generatedQid}</span>}
                </div>
                <div className="cypher-code">{generatedCypher}</div>
              </div>
              }

            {(explainLoading || explanation) &&
              <div className="explain-box">
                <div className="explain-label">✦ What this shows</div>
                {explainLoading ?
                <div className="explain-loading">
                    <span className="btn-spinner dark" /> Reading the results…
                  </div> :

                <p className="explain-text">{renderExplanation(explanation)}</p>
                }
              </div>
              }

            {!selectedNode && !generatedCypher && suggestions.length > 0 &&
              <div className="suggestions">
                {suggestions.map((s) =>
                <button
                  key={s}
                  className="suggestion-chip"
                  onClick={() => {setNlQuestion(s);runNLQuery(s);}}>
                  
                    {s}
                  </button>
                )}
              </div>
              }

            {queryHistory.length > 0 &&
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
                  {queryHistory.map((h, i) =>
                  <button
                    key={h.ts + "_" + i}
                    className="history-item"
                    title={h.cypher}
                    onClick={() => runNLQuery(h.question)}>
                    
                      {h.id && <span className="qid-tag">{h.id}</span>}
                      <span className="history-item-text">{h.question}</span>
                    </button>
                  )}
                </div>
              </>
              }

            </>}

            {tab === "keywords" &&
            <>
                <p className="panel-section-label">Filter by keyword</p>
                <p className="panel-hint">
                  Click keywords to build a filter. The graph shows every work
                  that matches, and the list below narrows to the keywords those
                  works still share.
                </p>

                <input
                className="kw-search"
                placeholder="Search keywords…"
                value={kwFilter}
                onChange={(e) => setKwFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredVocab.length) {
                    toggleKeyword(filteredVocab[0].keyword);
                    setKwFilter("");
                  }
                }} />


                {activeKeywords.length > 0 &&
              <div className="kw-active">
                    <div className="kw-active-head">
                      <span className="kw-active-title">
                        {loading ?
                    "Filtering…" :
                    `${resultWorks.length} work${resultWorks.length === 1 ? "" : "s"} match`}
                      </span>
                      <button
                    className="kw-active-clear"
                    onClick={clearKeywords}
                    title="Clear the whole filter">
                    
                        Clear
                      </button>
                    </div>

                    <div className="kw-chips">
                      {activeKeywords.map((k) =>
                  <button
                    key={k}
                    className="kw-chip selected"
                    onClick={() => toggleKeyword(k)}
                    title="Remove from filter">
                    
                          {displayKw(k)}
                          <span className="kw-chip-x">✕</span>
                        </button>
                  )}
                    </div>

                    {activeKeywords.length > 1 &&
                <div className="kw-mode">
                        <span className="kw-mode-label">Match</span>
                        <div className="kw-mode-seg">
                          <button
                      className={`kw-mode-btn${kwMode === "all" ? " active" : ""}`}
                      onClick={() => switchKwMode("all")}
                      title="Only works carrying every selected keyword">
                      
                            All
                          </button>
                          <button
                      className={`kw-mode-btn${kwMode === "any" ? " active" : ""}`}
                      onClick={() => switchKwMode("any")}
                      title="Works carrying at least one selected keyword">
                      
                            Any
                          </button>
                        </div>
                      </div>
                }

                    {!loading && resultWorks.length === 0 &&
                <p className="kw-empty">
                        No work carries all of these together.
                        {activeKeywords.length > 1 && " Switch to Any, or drop a keyword."}
                      </p>
                }
                  </div>
              }

                {vocabLoading && <p className="panel-hint">Loading keywords…</p>}

                {!vocabLoading && vocab.length === 0 &&
              <p className="panel-hint">
                    No keywords found on this database.
                  </p>
              }

                {!vocabLoading && vocab.length > 0 &&
              <>
                    <div className="kw-meta">
                      <span>
                        {kwFilter ?
                    `${filteredVocab.length} match${filteredVocab.length === 1 ? "" : "es"}` :
                    `${filteredVocab.length} keyword${filteredVocab.length === 1 ? "" : "s"}`}
                      </span>
                      {facetCounts &&
                  <span className="kw-meta-note">counts within matches</span>
                  }
                    </div>

                    {filteredVocab.length === 0 ?
                <p className="panel-hint">
                        Nothing left to narrow by — remove a keyword to widen the
                        search.
                      </p> :

                <div className="kw-list">
                        {filteredVocab.map((v) => {
                    const on = activeKeySet.has(normKey(v.keyword));
                    return (
                      <button
                        key={v.keyword}
                        className={`kw-row${on ? " active" : ""}`}
                        onClick={() => toggleKeyword(v.keyword)}
                        title={on ? "Remove from filter" : "Add to filter"}>
                        
                              <span className="kw-row-mark">{on ? "✓" : "+"}</span>
                              <span className="kw-row-text">{displayKw(v.keyword)}</span>
                              <span className="kw-row-count">{v.works}</span>
                            </button>);

                  })}
                      </div>
                }
                  </>
              }
              </>
            }

            {tab === "compare" &&
            <>
                <div className="history-header">
                  <p className="panel-section-label" style={{ marginBottom: 0 }}>
                    Compare works
                  </p>
                  {compare.length > 0 &&
                <button className="clear-history-btn" onClick={clearCompare}>
                      Clear
                    </button>
                }
                </div>

                <p className="panel-hint">
                  Click a work in the graph to add it — click it again to
                  remove. Selected works get an amber ring.
                </p>

                {compare.length > 0 &&
              <div className="cmp-list">
                    {compare.map((c) =>
                <div className="cmp-item" key={c.title}>
                        <div className="cmp-item-main">
                          <span className="cmp-item-title">{c.title}</span>
                          {c.author && <span className="cmp-item-author">{c.author}</span>}
                          <span className="cmp-item-count">{c.keywords.length} keywords</span>
                        </div>
                        <button
                    className="cmp-item-remove"
                    onClick={() => removeFromCompare(c.title)}
                    title="Remove">
                    
                          ✕
                        </button>
                      </div>
                )}
                  </div>
              }

                {compare.length === 1 &&
              <p className="panel-hint">Add one more work to compare.</p>
              }

                {compare.length >= 2 &&
              <>
                    <button
                  className={`expand-btn${compareViewOn ? " outline" : ""}`}
                  onClick={compareViewOn ? backToFullGraph : showOnlySelected}>
                  
                      {compareViewOn ? "← Back to full graph" : "Show only selected →"}
                    </button>

                    <div className="panel-divider" />

                    <div className="cmp-result-head">
                      <span className="cmp-result-title">In all {compare.length}</span>
                      <span className="cmp-result-n">{comparison.shared.length}</span>
                    </div>
                    {comparison.shared.length === 0 ?
                <p className="panel-hint">
                        No keyword appears in every selected work.
                      </p> :

                <>
                      <p className="panel-hint">
                        Rarest first — the number is how many works in the whole
                        archive carry it, so a low number is a stronger link.
                        Click one to filter the archive by it.
                      </p>
                      <div className="kw-chips">
                        {comparison.shared.map((s) =>
                    <button
                      key={s.keyword}
                      className={`kw-chip strong${s.hub ? " hub" : ""}`}
                      onClick={() => toggleKeyword(s.keyword)}
                      title={
                      s.hub ?
                      `Common across the archive — on ${s.freq} works` :
                      `On ${s.freq} work${s.freq === 1 ? "" : "s"} in the archive — click to filter`
                      }>
                      
                              {displayKw(s.keyword)}
                              <span className="kw-chip-n">{s.freq}</span>
                            </button>
                    )}
                      </div>
                    </>
                }

                    {comparison.partial.length > 0 &&
                <>
                        <div className="cmp-result-head" style={{ marginTop: 18 }}>
                          <span className="cmp-result-title">In some</span>
                          <span className="cmp-result-n">{comparison.partial.length}</span>
                        </div>
                        <div className="kw-chips">
                          {comparison.partial.map((s) =>
                    <button
                      key={s.keyword}
                      className={`kw-chip${s.hub ? " hub" : ""}`}
                      onClick={() => toggleKeyword(s.keyword)}
                      title={`Shared by ${s.n} of the selected works — on ${s.freq} in the archive`}>
                      
                              {displayKw(s.keyword)}
                              <span className="kw-chip-n">{s.n}</span>
                            </button>
                    )}
                        </div>
                      </>
                }
                  </>
              }
              </>
            }

          </div>
        </div>

      </div>
    </div>);

}

export default CypherQueryTester;
