import React from "react";
import { ABOUT } from "./content";

export default function About() {
  return (
    <>
      <div className="bh-page-head">
        <h1 className="bh-h1">About Us</h1>
      </div>
      <div className="bh-prose">
        {ABOUT.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="bh-pending" style={{ marginTop: 10 }}>
          Project credits and contact pending
        </p>
      </div>
    </>
  );
}
