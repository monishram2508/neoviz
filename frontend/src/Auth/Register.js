import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./auth.css";
import { apiUrl } from "../api";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (loading) return;
    setError("");
    if (!email.trim() || !password) {
      setError("Please fill in both fields.");
      return;
    }
    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        navigate("/login");
      } else {
        setError(data.error || "Registration failed");
      }
    } catch {
      setError("Cannot reach the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">

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

      <div className="auth-right">
        <div className="auth-card">
          <p className="auth-card-label">Create account</p>
          <h2 className="auth-card-title">Get started</h2>
          <p className="auth-card-sub">Set up your account in a few seconds.</p>

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
              onKeyDown={(e) => e.key === "Enter" && handleRegister()} />
            
          </div>

          <div className="auth-field">
            <label className="auth-field-label">Password</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                style={{ paddingRight: "58px" }}
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()} />
              
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((s) => !s)}>
                
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button className="auth-btn" onClick={handleRegister} disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p className="auth-switch">
            Already registered?{" "}
            <span onClick={() => navigate("/login")}>Sign in</span>
          </p>
        </div>
      </div>
    </div>);

}
