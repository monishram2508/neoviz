import React from "react";
import { useNavigate } from "react-router-dom";
import "./NotFound.css";

function NotFound() {
  const navigate = useNavigate();
  const signedIn = !!localStorage.getItem("token");

  return (
    <div className="nf-root">
      <div className="nf-card">
        <span className="nf-mark">⬡</span>
        <div className="nf-code">404</div>
        <h1 className="nf-title">This page doesn't exist</h1>
        <p className="nf-text">
          The address you followed doesn't match any page in NeoViz.
        </p>
        <button
          className="nf-btn"
          onClick={() => navigate(signedIn ? "/configuration" : "/login")}>
          
          {signedIn ? "Back to your databases" : "Go to sign in"}
        </button>
      </div>
    </div>);

}

export default NotFound;
