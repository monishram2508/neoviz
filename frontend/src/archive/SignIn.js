import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell, { PasswordField } from "./AuthShell";
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
    <AuthShell
      title="Sign in"
      subtitle="Welcome back. Sign in to contribute to the archive."
      aside={
      <>
          New to the archive?{" "}
          <Link className="bh-link" to={`/join?next=${encodeURIComponent(next)}`} replace>Create an account</Link>
        </>
      }>

      <form className="bh-form" onSubmit={onSubmit}>
        <label className="bh-field">
          <span>Email</span>
          <input
            className="bh-input"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)} />

        </label>
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)} />

        {error && <p className="bh-error" role="alert">{error}</p>}
        <button className="bh-btn block" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>);

}
