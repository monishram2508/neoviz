import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell, { PasswordField } from "./AuthShell";
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
    <AuthShell
      title="Create an account"
      subtitle="Add notes, sources and corrections to the archive."
      aside={
      <>
          Already have an account?{" "}
          <Link className="bh-link" to={`/signin?next=${encodeURIComponent(next)}`} replace>Sign in</Link>
        </>
      }>

      <form className="bh-form" onSubmit={onSubmit}>
        <label className="bh-field">
          <span>Display name</span>
          <input
            className="bh-input"
            autoComplete="nickname"
            autoFocus
            required
            minLength={2}
            maxLength={40}
            value={form.displayName}
            onChange={set("displayName")} />

          <small>Shown next to everything you contribute.</small>
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
        <PasswordField
          label="Password"
          hint="At least 8 characters."
          autoComplete="new-password"
          minLength={8}
          value={form.password}
          onChange={set("password")} />

        <label className="bh-check">
          <input type="checkbox" checked={form.showEmail} onChange={set("showEmail")} />
          <span>Show my email on my profile</span>
        </label>
        {error && <p className="bh-error" role="alert">{error}</p>}
        <button className="bh-btn block" type="submit" disabled={busy}>
          {busy ? "Creating your account…" : "Create account"}
        </button>
        <p className="bh-auth-fine">A moderator reviews every contribution before it appears on the site.</p>
      </form>
    </AuthShell>);

}
