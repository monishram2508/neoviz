import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BrandMark from "./BrandMark";
import "./archive.css";

export function PasswordField({ label, hint, autoComplete, minLength, value, onChange }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="bh-field">
      <span>{label}</span>
      <span className="bh-pass">
        <input
          className="bh-input"
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={onChange} />

        <button
          type="button"
          className="bh-pass-toggle"
          aria-pressed={shown}
          aria-label={shown ? "Hide password" : "Show password"}
          onClick={() => setShown((s) => !s)}>

          {shown ? "Hide" : "Show"}
        </button>
      </span>
      {hint && <small>{hint}</small>}
    </label>);

}

export default function AuthShell({ title, subtitle, aside, children }) {
  const navigate = useNavigate();
  const { key } = useLocation();
  const goBack = () => key === "default" ? navigate("/") : navigate(-1);

  return (
    <div className="bh bh-auth">
      <button type="button" className="bh-auth-back" onClick={goBack} aria-label="Go back" title="Go back">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
          <path d="M19 12H5M11 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <main className="bh-auth-main">
        <div className="bh-auth-card">
          <BrandMark className="bh-auth-mark" />
          <h1 className="bh-auth-title">{title}</h1>
          {subtitle && <p className="bh-auth-sub">{subtitle}</p>}
          {children}
        </div>
        {aside && <p className="bh-auth-aside">{aside}</p>}
      </main>
    </div>);

}
