import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./auth.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
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
      setError("Cannot reach server. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-grid" />

      {/* LEFT PANEL */}
      <div className="auth-left">
        <div className="auth-left-inner">
          <div className="auth-brand">
            <span className="auth-brand-icon">⬡</span>
            <span className="auth-brand-name">NEOVIZ</span>
          </div>
          <h1 className="auth-headline">
            Graph databases,<br />
            <span>made human.</span>
          </h1>
          <p className="auth-desc">
            Connect to any Neo4j instance and explore its structure
            through interactive visualization and natural language queries.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="auth-right">
        <div className="auth-card">
          <div className="auth-card-top-line" />
          <p className="auth-card-label">SIGN IN</p>
          <h2 className="auth-card-title">Welcome back</h2>

          {error && <div className="auth-error">{error}</div>}

          <div className="auth-field">
            <label className="auth-field-label">EMAIL</label>
            <input
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>

          <div className="auth-field">
            <label className="auth-field-label">PASSWORD</label>
            <input
              className="auth-input"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </div>

          <button className="auth-btn" onClick={handleLogin} disabled={loading}>
            {loading ? "SIGNING IN..." : "SIGN IN →"}
          </button>

          <p className="auth-switch">
            No account?{" "}
            <span onClick={() => navigate("/register")}>Register here</span>
          </p>
        </div>
      </div>
    </div>
  );
}