import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./auth.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("token", data.token);
        navigate("/configuration");
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Cannot reach the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">

      {/* BRAND PANEL */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <span className="auth-brand-mark">⬡</span>
            <span className="auth-brand-name">NEOVIZ</span>
          </div>

          <h1 className="auth-headline">
            Explore graph data,<br />
            <span>without writing queries.</span>
          </h1>

          <p className="auth-desc">
            Connect to any Neo4j database and navigate its structure through
            an interactive visual graph — or just ask questions in plain English.
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <span className="auth-feature-icon">◉</span>
              Interactive force-directed visualization
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">✦</span>
              Natural language → Cypher, powered by LLM
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">⚡</span>
              Works with any Neo4j schema, zero setup
            </div>
          </div>
        </div>
      </div>

      {/* FORM PANEL */}
      <div className="auth-right">
        <div className="auth-card">
          <p className="auth-card-label">Sign in</p>
          <h2 className="auth-card-title">Welcome back</h2>
          <p className="auth-card-sub">Enter your credentials to continue.</p>

          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label className="auth-field-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>

          <div className="auth-field">
            <label className="auth-field-label">Password</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                style={{ paddingRight: "58px" }}
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button className="auth-btn" onClick={handleLogin} disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="auth-switch">
            Don't have an account?{" "}
            <span onClick={() => navigate("/register")}>Create one</span>
          </p>
        </div>
      </div>
    </div>
  );
}
