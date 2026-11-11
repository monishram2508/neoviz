import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getMeta } from "./api";
import { QUEUE_EVENT, getQueue } from "./memberApi";
import { atLeast, useAccount } from "./account";
import { longDate } from "./format";
import "./archive.css";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About Us" },
  { to: "/authors", label: "Authors" },
  { to: "/works", label: "Works" },
  { to: "/contribute", label: "Contribute" }
];

const AUTH_PAGES = ["/signin", "/join"];

const navClass = ({ isActive }) => (isActive ? "on" : undefined);

function useWaitingCount(canReview) {
  const { pathname } = useLocation();
  const [count, setCount] = useState(0);
  const [changes, setChanges] = useState(0);

  useEffect(() => {
    const bump = () => setChanges((n) => n + 1);
    window.addEventListener(QUEUE_EVENT, bump);
    return () => window.removeEventListener(QUEUE_EVENT, bump);
  }, []);

  useEffect(() => {
    if (!canReview) {
      setCount(0);
      return undefined;
    }
    let live = true;
    getQueue({ status: "pending" }).
    then((items) => live && setCount(items.length)).
    catch(() => live && setCount(0));
    return () => {
      live = false;
    };
  }, [canReview, pathname, changes]);

  return count;
}

function AccountLinks() {
  const { account, loading, signOut } = useAccount();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const canReview = Boolean(account) && atLeast(account.role, "moderator");
  const waiting = useWaitingCount(canReview);

  if (loading) return <div className="bh-acct" aria-busy="true" />;

  if (!account) {
    const here = AUTH_PAGES.includes(pathname) ? "/" : pathname + search;
    return (
      <div className="bh-acct">
        <NavLink to={`/signin?next=${encodeURIComponent(here)}`} className={navClass}>Sign in</NavLink>
      </div>);

  }

  return (
    <div className="bh-acct">
      {canReview &&
      <NavLink to="/review" className={navClass}>
          Review
          {waiting > 0 && <span className="bh-badge" aria-label={`${waiting} waiting`}>{waiting}</span>}
        </NavLink>
      }
      {atLeast(account.role, "admin") && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
      {atLeast(account.role, "sysadmin") && <NavLink to="/system" className={navClass}>System</NavLink>}
      <NavLink to={`/people/${account.id}`} className={navClass}>{account.displayName || "Your profile"}</NavLink>
      <button
        type="button"
        className="bh-linkbtn"
        onClick={() => {
          signOut();
          navigate("/");
        }}>

        Sign out
      </button>
    </div>);

}

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
            {NAV.map((n) =>
            <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                {n.label}
              </NavLink>
            )}
          </nav>
          <AccountLinks />
        </div>
      </header>

      <main className="bh-main">
        <Outlet />
        {meta && meta.source === "snapshot" &&
        <div className="bh-banner">
            Showing the archive snapshot{meta.takenAt ? ` of ${longDate(meta.takenAt)}` : ""}. The live
            database was unreachable{meta.neo4jError ? ` (${meta.neo4jError})` : ""}.
          </div>
        }
      </main>

      <footer className="bh-foot">
        Bay&#257;z-e-Hay&#257;t &middot; a literary archive of Hyderabad
        {meta && meta.works ? ` · ${meta.works} works by ${meta.authors} authors` : ""}
      </footer>
    </div>);

}
