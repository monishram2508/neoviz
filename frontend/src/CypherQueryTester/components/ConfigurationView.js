import "../configuration.css";

const PALETTE = ["#38bdf8", "#4ade80", "#facc15", "#c084fc", "#fb7185", "#fb923c"];

const labelColor = (label) => {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

export const ConfigurationLoadingView = () =>
<div className="cfg-loading">
    <div className="spinner" />
    <span className="cfg-loading-text">Connecting to database…</span>
  </div>;

const Navbar = ({ onLogout }) =>
<div className="cfg-navbar">
    <div className="cfg-brand">
      <span className="cfg-brand-mark">⬡</span>
      <span className="cfg-brand-name">NEOVIZ</span>
    </div>
    <button className="cfg-logout" onClick={onLogout}>Sign out</button>
  </div>;

const Steps = ({ current }) =>
<div className="cfg-steps">
    <div className={`cfg-step ${current === 1 ? "active" : "done"}`}>
      <span className="cfg-step-num">{current > 1 ? "✓" : "1"}</span>
      Connect
    </div>
    <div className="cfg-step-line" />
    <div className={`cfg-step ${current === 2 ? "active" : ""}`}>
      <span className="cfg-step-num">2</span>
      Explore
    </div>
  </div>;

const ConnectionForm = ({
  connections, onSavedConnectionSelect, connectionName, onConnectionNameChange,
  uri, onUriChange, username, onUsernameChange, password, onPasswordChange,
  showPassword, onTogglePassword, onConnect, loading, error
}) =>
<div className="cfg-card">
    <p className="cfg-card-label">Database connection</p>
    <h2 className="cfg-card-title">Connect to Neo4j</h2>
    <p className="cfg-card-sub">
      Enter your database credentials. Works with AuraDB or any self-hosted instance.
    </p>

    {connections.length > 0 &&
  <>
        <div className="cfg-field">
          <label className="cfg-field-label">Saved connections</label>
          <select
        className="cfg-select"
        defaultValue=""
        onChange={(e) => onSavedConnectionSelect(e.target.value)}>
        
            <option value="" disabled>Choose a saved connection…</option>
            {connections.map((c) =>
        <option key={c.id} value={c.id}>
                {c.name && c.name !== c.uri ? `${c.name} — ${c.uri}` : c.uri}
              </option>
        )}
          </select>
        </div>
        <div className="cfg-divider">or enter manually</div>
      </>
  }

    <div className="cfg-field">
      <label className="cfg-field-label">Connection name</label>
      <input
      className="cfg-input"
      type="text"
      placeholder="e.g. Research DB (optional)"
      value={connectionName}
      onChange={(e) => onConnectionNameChange(e.target.value)} />
    
    </div>

    <div className="cfg-field">
      <label className="cfg-field-label">Neo4j URI</label>
      <input
      className="cfg-input"
      type="text"
      placeholder="neo4j+s://xxxxxxxx.databases.neo4j.io"
      value={uri}
      onChange={(e) => onUriChange(e.target.value)} />
    
    </div>

    <div className="cfg-field">
      <label className="cfg-field-label">Username</label>
      <input
      className="cfg-input"
      type="text"
      placeholder="Database username"
      value={username}
      onChange={(e) => onUsernameChange(e.target.value)} />
    
    </div>

    <div className="cfg-field">
      <label className="cfg-field-label">Password</label>
      <div className="cfg-input-wrap">
        <input
        className="cfg-input"
        style={{ paddingRight: "58px" }}
        type={showPassword ? "text" : "password"}
        placeholder="••••••••••"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onConnect()} />
      
        <button type="button" className="cfg-eye" onClick={onTogglePassword}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </div>

    {error && <div className="cfg-error">{error}</div>}

    <button className="cfg-connect-btn" onClick={onConnect} disabled={loading}>
      {loading && <span className="btn-spinner" />}
      {loading ? "Connecting…" : "Connect"}
    </button>
  </div>;

const ExploreGrid = ({ nodes, onNodeClick, nodesLoading, uri, onSwitchDb, error, onRetry }) => {
  const host = uri ? uri.replace(/^neo4j(\+s{1,2}c?)?:\/\//, "").replace(/^bolt(\+s{1,2}c?)?:\/\//, "") : "";

  return (
    <div className="cfg-explore">
      <div className="cfg-conn-banner">
        <div className="cfg-conn-info">
          <span className="cfg-conn-dot" />
          <span className="cfg-conn-host">{host || "connected"}</span>
          <span className="cfg-conn-label">connected</span>
        </div>
        <button className="cfg-switch-db" onClick={onSwitchDb}>
          Use a different database
        </button>
      </div>

      <h2 className="cfg-explore-title">Choose a starting point</h2>
      <p className="cfg-explore-sub">
        These are the node types found in your database. Pick one to open the graph explorer.
      </p>

      {nodesLoading && nodes.length === 0 ?
      <div className="cfg-grid">
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="cfg-skeleton" />)}
        </div> :
      nodes.length === 0 ?
      <div className="cfg-grid-empty">
          <p className="cfg-grid-empty-text">
            {error || "No node types came back from the database. It may still be waking up."}
          </p>
          <button className="cfg-retry-btn" onClick={onRetry}>↺ Try again</button>
        </div> :

      <div className="cfg-grid">
          {nodes.map((node, i) =>
        <div key={i} className="cfg-node-card" onClick={() => onNodeClick(node)}>
              <span className="cfg-node-dot" style={{ background: labelColor(node.label) }} />
              <span className="cfg-node-name">{node.label}</span>
              <span className="cfg-node-arrow">→</span>
            </div>
        )}
        </div>
      }
    </div>);

};

export default function ConfigurationView({
  connected, onLogout, connections, onSavedConnectionSelect,
  connectionName, onConnectionNameChange, uri, onUriChange,
  username, onUsernameChange, password, onPasswordChange,
  showPassword, onTogglePassword, onConnect, loading, error,
  nodes, onNodeClick, nodesLoading, onSwitchDb, onRetry
}) {
  return (
    <div className="cfg-root">
      <Navbar onLogout={onLogout} />
      <div className="cfg-main">
        <Steps current={connected ? 2 : 1} />
        {!connected ?
        <ConnectionForm
          connections={connections}
          onSavedConnectionSelect={onSavedConnectionSelect}
          connectionName={connectionName}
          onConnectionNameChange={onConnectionNameChange}
          uri={uri}
          onUriChange={onUriChange}
          username={username}
          onUsernameChange={onUsernameChange}
          password={password}
          onPasswordChange={onPasswordChange}
          showPassword={showPassword}
          onTogglePassword={onTogglePassword}
          onConnect={onConnect}
          loading={loading}
          error={error} /> :

        <ExploreGrid
          nodes={nodes}
          onNodeClick={onNodeClick}
          nodesLoading={nodesLoading}
          uri={uri}
          onSwitchDb={onSwitchDb}
          error={error}
          onRetry={onRetry} />

        }
      </div>
    </div>);

}
