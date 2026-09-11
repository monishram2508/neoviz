import "../configuration.css";

export const ConfigurationLoadingView = () => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "center",
    height: "100vh", flexDirection: "column", gap: "12px",
    background: "var(--bg)", fontFamily: "var(--font)",
  }}>
    <div style={{
      width: "28px", height: "28px",
      border: "2px solid var(--border)", borderTop: "2px solid var(--accent)",
      borderRadius: "50%", animation: "spin 0.7s linear infinite",
    }} />
    <span style={{ fontSize: "13px", color: "var(--text-2)" }}>Connecting…</span>
  </div>
);

const Navbar = ({ onLogout }) => (
  <div style={{
    height: "52px", background: "var(--surface)", borderBottom: "1px solid var(--border)",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 20px", position: "sticky", top: 0, zIndex: 100,
    fontFamily: "var(--font)",
  }}>
    <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "var(--text-1)" }}>
      ⬡ NEOVIZ
    </span>
    <button onClick={onLogout} style={{
      height: "28px", padding: "0 12px", fontSize: "11px", fontWeight: 500,
      fontFamily: "var(--font)", border: "1px solid #fecaca", borderRadius: "6px",
      background: "#fef2f2", color: "#ef4444", cursor: "pointer",
    }}>
      Logout
    </button>
  </div>
);

const ConnectionForm = ({
  connections, onSavedConnectionSelect, connectionName, onConnectionNameChange,
  uri, onUriChange, username, onUsernameChange, password, onPasswordChange,
  showPassword, onTogglePassword, onConnect, loading, error,
}) => {
  const inputStyle = {
    width: "100%", padding: "8px 10px", fontSize: "13px",
    fontFamily: "Inter, sans-serif", border: "1px solid #e5e7eb",
    borderRadius: "8px", background: "#f9fafb",
    color: "#111827", outline: "none",
  };
  const labelStyle = {
    display: "block", fontSize: "10px", fontWeight: 600,
    letterSpacing: "0.1em", color: "#9ca3af", marginBottom: "5px",
  };

  return (
    <div style={{
      width: "100%", maxWidth: "400px", background: "#ffffff",
      border: "1px solid #e5e7eb", borderRadius: "12px",
      padding: "2rem", fontFamily: "Inter, sans-serif",
      boxShadow: "0 1px 8px rgba(0,0,0,0.06)",
    }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ width: "24px", height: "3px", background: "#111827", borderRadius: "2px", marginBottom: "1rem" }} />
        <p style={{ ...labelStyle, marginBottom: "4px" }}>DATABASE CONNECTION</p>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#111827" }}>Connect to Neo4j</h2>
      </div>

      {connections.length > 0 && (
        <div style={{ marginBottom: "1rem" }}>
          <label style={labelStyle}>SAVED CONNECTIONS</label>
          <select
            onChange={(e) => onSavedConnectionSelect(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select saved connection…</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name && c.name !== c.uri ? `${c.name} — ${c.uri}` : c.uri}
              </option>
            ))}
          </select>
        </div>
      )}

      {[
        { label: "CONNECTION NAME", value: connectionName, onChange: onConnectionNameChange, placeholder: "e.g. My Research DB" },
        { label: "NEO4J URI", value: uri, onChange: onUriChange, placeholder: "neo4j+s://xxxxxxxx.databases.neo4j.io" },
        { label: "USERNAME", value: username, onChange: onUsernameChange, placeholder: "Username" },
      ].map(({ label, value, onChange, placeholder }) => (
        <div key={label} style={{ marginBottom: "0.9rem" }}>
          <label style={labelStyle}>{label}</label>
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
        </div>
      ))}

      <div style={{ marginBottom: "1.25rem" }}>
        <label style={labelStyle}>PASSWORD</label>
        <div style={{ position: "relative" }}>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="••••••••••"
            style={{ ...inputStyle, paddingRight: "44px" }}
          />
          <button type="button" onClick={onTogglePassword} style={{
            position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", fontSize: "11px", color: "#9ca3af", cursor: "pointer",
          }}>
            {showPassword ? "hide" : "show"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "8px 10px", background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: "8px", fontSize: "12px", color: "#ef4444", marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      <button
        onClick={onConnect} disabled={loading}
        style={{
          width: "100%", padding: "0.65rem", background: "#111827", color: "white",
          fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
          fontFamily: "Inter, sans-serif", border: "none", borderRadius: "8px",
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1,
          transition: "background 0.15s",
        }}
        onMouseOver={(e) => !loading && (e.currentTarget.style.background = "#1f2937")}
        onMouseOut={(e) => (e.currentTarget.style.background = "#111827")}
      >
        {loading ? "Connecting…" : "Connect →"}
      </button>
    </div>
  );
};

const NodeGrid = ({ nodes, onNodeClick, nodesLoading }) => (
  <div style={{ width: "100%", maxWidth: "560px", fontFamily: "Inter, sans-serif" }}>
    <p style={{
      fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em",
      color: "#9ca3af", marginBottom: "14px",
    }}>
      SELECT A NODE TYPE TO EXPLORE
    </p>

    {nodesLoading && nodes.length === 0 ? (
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px",
      }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            height: "52px", background: "#f3f4f6", borderRadius: "8px",
            animation: "pulse 1.2s ease-in-out infinite",
          }} />
        ))}
      </div>
    ) : (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px" }}>
      {nodes.map((node, i) => (
        <div
          key={i}
          onClick={() => onNodeClick(node)}
          style={{
            padding: "16px 12px", background: "#ffffff",
            border: "1px solid #e5e7eb", borderRadius: "8px",
            cursor: "pointer", textAlign: "center",
            fontSize: "13px", fontWeight: 500, color: "#111827",
            transition: "all 0.15s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = "#93c5fd";
            e.currentTarget.style.background = "#eff6ff";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.background = "#ffffff";
          }}
        >
          {node.label}
        </div>
      ))}
    </div>
    )}
  </div>
);

export default function ConfigurationView({
  connected, onLogout, connections, onSavedConnectionSelect,
  connectionName, onConnectionNameChange, uri, onUriChange,
  username, onUsernameChange, password, onPasswordChange,
  showPassword, onTogglePassword, onConnect, loading, error,
  nodes, onNodeClick, nodesLoading,
}) {
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "Inter, sans-serif" }}>
      <Navbar onLogout={onLogout} />
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "3rem 1.5rem",
        minHeight: "calc(100vh - 52px)",
      }}>
        {!connected
          ? <ConnectionForm
              connections={connections} onSavedConnectionSelect={onSavedConnectionSelect}
              connectionName={connectionName} onConnectionNameChange={onConnectionNameChange}
              uri={uri} onUriChange={onUriChange}
              username={username} onUsernameChange={onUsernameChange}
              password={password} onPasswordChange={onPasswordChange}
              showPassword={showPassword} onTogglePassword={onTogglePassword}
              onConnect={onConnect} loading={loading} error={error}
            />
          : <NodeGrid nodes={nodes} onNodeClick={onNodeClick} nodesLoading={nodesLoading} />
        }
      </div>
    </div>
  );
}
