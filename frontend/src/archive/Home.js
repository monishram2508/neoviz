import React from "react";
import { Link } from "react-router-dom";
import Carousel from "./Carousel";
import { ABOUT, HERO_SLIDES } from "./content";

export default function Home() {
  return (
    <>
      <div style={{ paddingTop: 24 }}>
        <Carousel
          slides={HERO_SLIDES}
          title="Bay&#257;z-e-Hay&#257;t"
          subtitle="A Literary Archive of Hyderabad"
        />
      </div>

      <div className="bh-prose">
        {ABOUT.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", paddingTop: 26 }}>
        <Link to="/authors" className="bh-card" style={{ flex: "1 1 240px", padding: "18px 20px" }}>
          <p className="bh-card-title" style={{ marginBottom: 6 }}>Browse authors</p>
          <p className="bh-card-meta">Every writer in the archive, with their collected works.</p>
        </Link>
        <Link to="/works" className="bh-card" style={{ flex: "1 1 240px", padding: "18px 20px" }}>
          <p className="bh-card-title" style={{ marginBottom: 6 }}>Search by keyword</p>
          <p className="bh-card-meta">Combine subjects to find works that share them.</p>
        </Link>
      </div>
    </>
  );
}
