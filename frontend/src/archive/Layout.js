import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getMeta } from "./api";
import { QUEUE_EVENT, getQueue, getSystem } from "./memberApi";
import { atLeast, useAccount } from "./account";
import { longDate } from "./format";
import BrandMark from "./BrandMark";
import { pathFor, visibleGroups } from "./Settings";
import "./archive.css";

const NAV = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About Us" },
  { to: "/authors", label: "Authors" },
  { to: "/works", label: "Works" },
  { to: "/contribute", label: "Contribute" }
];

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
    return (
      <div className="bh-acct">
        <NavLink to={`/signin?next=${encodeURIComponent(pathname + search)}`} className={navClass}>Sign in</NavLink>
      </div>);

  }

  return (
    <div className="bh-acct">
      {canReview &&
      <NavLink to="/review" className={navClass}>
          Review
          {waiting > 0 && <span className="bh-badge" aria-label={`${waiting} pending`}>{waiting}</span>}
        </NavLink>
      }
      <AccountMenu
        role={account.role}
        onSignOut={() => {
          signOut();
          navigate("/");
        }} />

    </div>);

}

function AccountMenu({ role, onSignOut }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => !ref.current.contains(event.target) && setOpen(false);
    const onKey = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="bh-acct-drop">
      <button
        type="button"
        className="bh-acct-btn"
        aria-expanded={open}
        aria-controls="bh-acct-menu"
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}>

        <span className="bh-bars" aria-hidden="true" />
      </button>
      <div id="bh-acct-menu" className={`bh-acct-menu${open ? " open" : ""}`}>
        {visibleGroups(role).map((g) =>
        <div key={g.title} className="bh-acct-group">
            <p className="bh-acct-group-h">{g.title}</p>
            {g.sections.map((s) =>
          <NavLink
            key={s.key}
            to={pathFor(s.key)}
            end
            className={({ isActive }) => [g.sys && "bh-sys", isActive && "on"].filter(Boolean).join(" ") || undefined}>

                {s.label}
              </NavLink>
          )}
          </div>
        )}
        <div className="bh-acct-group bh-acct-out">
          <button type="button" className="bh-linkbtn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </div>);

}

function SnapshotBanner({ takenAt }) {
  const { account } = useAccount();
  const sysadmin = Boolean(account) && atLeast(account.role, "sysadmin");
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setDetail(null);
    if (!sysadmin) return undefined;
    let live = true;
    getSystem().
    then((info) => live && setDetail(info.archive.neo4jError || null)).
    catch((err) => live && setDetail(err.message));
    return () => {
      live = false;
    };
  }, [sysadmin]);

  return (
    <div className="bh-banner">
      Showing the archive{takenAt ? ` as of ${longDate(takenAt)}` : ""}. Recent changes may not appear yet.
      {detail && <p className="bh-sys bh-banner-sys">The live database was unreachable: {detail}</p>}
    </div>);

}

export default function Layout() {
  const [meta, setMeta] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const section = pathname.split("/")[1];
  const wide = section === "review" || section === "settings" ? " wide" : "";

  useEffect(() => {
    getMeta().then(setMeta).catch(() => setMeta({ source: "unavailable" }));
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="bh">
      <header className="bh-head">
        <div className={`bh-head-in${wide}`}>
          <BrandMark className="bh-mark" />
          <button
            type="button"
            className="bh-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="bh-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}>

            <span className="bh-bars" aria-hidden="true" />
          </button>
          <div id="bh-menu" className={`bh-menu${menuOpen ? " open" : ""}`}>
            <nav className="bh-nav">
              {NAV.map((n) =>
              <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                  {n.label}
                </NavLink>
              )}
            </nav>
            <AccountLinks />
          </div>
        </div>
      </header>

      <main className={`bh-main${wide}`}>
        <div key={section} className="bh-page">
          <Outlet />
        </div>
        {meta && meta.source === "snapshot" && <SnapshotBanner takenAt={meta.takenAt} />}
      </main>
    </div>);

}
