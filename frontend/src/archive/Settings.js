import React from "react";
import { Link, NavLink, Navigate, useLocation, useParams } from "react-router-dom";
import { atLeast, useAccount } from "./account";
import { ProfileSettings } from "./Profile";
import { Activity, People } from "./Admin";
import { Status } from "./System";

const GROUPS = [
{
  title: "Account",
  sections: [
  { key: "profile", label: "Profile", role: "contributor", intro: "Manage your display name and what is visible on your public profile." }]

},
{
  title: "Administration",
  sections: [
  { key: "users", label: "Users", role: "admin", intro: "Manage user accounts, roles and access." },
  { key: "activity", label: "Activity log", role: "admin", intro: "A chronological record of actions taken on the site, most recent first." }]

},
{
  title: "System",
  sys: true,
  sections: [
  { key: "system", label: "Server status", role: "sysadmin", intro: "Data source, storage locations and maintenance tools." }]

}];


export const pathFor = (key) => key === "profile" ? "/settings" : `/settings/${key}`;

export const visibleGroups = (role) => GROUPS.
map((g) => ({ ...g, sections: g.sections.filter((s) => atLeast(role, s.role)) })).
filter((g) => g.sections.length > 0);

function SectionBody({ section, account }) {
  if (section === "users") return <People viewer={account} />;
  if (section === "activity") return <Activity />;
  if (section === "system") return <div className="bh-sys-page"><Status /></div>;
  return (
    <div className="bh-settings-narrow">
      <ProfileSettings />
      <p>
        <Link className="bh-link" to={`/people/${account.id}`}>View your public profile</Link>
      </p>
    </div>);

}

export default function Settings() {
  const { section = "profile" } = useParams();
  const { account, loading } = useAccount();
  const { pathname } = useLocation();

  if (loading) return <div className="bh-empty bh-page-head">Loading&hellip;</div>;
  if (!account) return <Navigate to={`/signin?next=${encodeURIComponent(pathname)}`} replace />;

  const groups = visibleGroups(account.role);
  const group = groups.find((g) => g.sections.some((s) => s.key === section));
  if (!group) return <Navigate to="/settings" replace />;
  const current = group.sections.find((s) => s.key === section);

  return (
    <div className="bh-settings">
      <nav className="bh-settings-nav" aria-label="Settings sections">
        <div className="bh-settings-who">
          <h1>Settings</h1>
        </div>
        {groups.map((g) =>
        <div key={g.title} className="bh-settings-group">
            <h2>{g.title}</h2>
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
      </nav>
      <section className="bh-settings-body">
        <h2 className={group.sys ? "bh-settings-title bh-sys" : "bh-settings-title"}>{current.label}</h2>
        <p className="bh-sub">{current.intro}</p>
        <SectionBody section={current.key} account={account} />
      </section>
    </div>);

}
