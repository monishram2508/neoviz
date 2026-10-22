import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getMeta } from "./api";
import "./archive.css";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About Us" },
  { to: "/authors", label: "Authors" },
  { to: "/works", label: "Works" }
];

export default function Layout() {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    getMeta().then(setMeta).catch(() => setMeta({ source: "unavailable" }));
  }, []);

  return (
    <div className="bh">
      <header className="bh-head">
        <div className="bh-head-in">
          <NavLink to="/" className="bh-mark">Bay&#257;z-e-Hay&#257;t</NavLink>
          <nav className="bh-nav">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => (isActive ? "on" : undefined)}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="bh-main">
        <Outlet />
        {meta && meta.source === "snapshot" && (
          <div className="bh-banner">
            Showing the archive snapshot of 14 September. The live database was unreachable
            {meta.neo4jError ? ` (${meta.neo4jError})` : ""}.
          </div>
        )}
      </main>

      <footer className="bh-foot">
        Bay&#257;z-e-Hay&#257;t &middot; a literary archive of Hyderabad
        {meta && meta.works ? ` · ${meta.works} works by ${meta.authors} authors` : ""}
      </footer>
    </div>
  );
}
