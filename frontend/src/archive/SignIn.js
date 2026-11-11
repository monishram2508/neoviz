import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "./memberApi";
import { safeNext, useAccount } from "./account";

export default function SignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const { signIn } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await login({ email, password });
      await signIn(token);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="bh-narrow">
      <header className="bh-page-head">
        <h1 className="bh-h1">Sign in</h1>
        <p className="bh-sub">Sign in to add notes, sources and corrections to the archive.</p>
      </header>

      <form className="bh-form" onSubmit={onSubmit}>
        <label className="bh-field">
          <span>Email</span>
          <input
            className="bh-input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)} />

        </label>
        <label className="bh-field">
          <span>Password</span>
          <input
            className="bh-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)} />

        </label>
        {error && <p className="bh-error" role="alert">{error}</p>}
        <div className="bh-actions">
          <button className="bh-btn" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>

      <p className="bh-sub bh-after">
        No account yet?{" "}
        <Link className="bh-link" to={`/join?next=${encodeURIComponent(next)}`}>Join the archive</Link>
      </p>
    </section>);

}
