import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { register } from "./memberApi";
import { safeNext, useAccount } from "./account";

export default function Join() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const { signIn } = useAccount();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", showEmail: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await register(form);
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
        <h1 className="bh-h1">Join the archive</h1>
        <p className="bh-sub">
          Anyone can browse. An account lets you add context, sources and corrections, which a
          moderator reviews before they appear.
        </p>
      </header>

      <form className="bh-form" onSubmit={onSubmit}>
        <label className="bh-field">
          <span>Display name</span>
          <input
            className="bh-input"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={40}
            value={form.displayName}
            onChange={set("displayName")} />

          <small>Shown next to everything you contribute. 2–40 characters.</small>
        </label>
        <label className="bh-field">
          <span>Email</span>
          <input
            className="bh-input"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={set("email")} />

        </label>
        <label className="bh-field">
          <span>Password</span>
          <input
            className="bh-input"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set("password")} />

          <small>At least 8 characters.</small>
        </label>
        <label className="bh-check">
          <input type="checkbox" checked={form.showEmail} onChange={set("showEmail")} />
          <span>Show my email on my profile</span>
        </label>
        {error && <p className="bh-error" role="alert">{error}</p>}
        <div className="bh-actions">
          <button className="bh-btn" type="submit" disabled={busy}>
            {busy ? "Creating your account…" : "Join"}
          </button>
        </div>
      </form>

      <p className="bh-sub bh-after">
        Already have an account?{" "}
        <Link className="bh-link" to={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link>
      </p>
    </section>);

}
