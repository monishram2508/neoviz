import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { atLeast, useAccount } from "./account";
import { dateTime, longDate } from "./format";
import { getSystem, reloadArchive } from "./memberApi";

const KB = 1024;
const MB = KB * 1024;

const size = (bytes) => {
  if (bytes == null) return "Missing";
  return bytes < MB ? `${(bytes / KB).toFixed(1)} KB` : `${(bytes / MB).toFixed(1)} MB`;
};

function Facts({ rows }) {
  return (
    <dl className="bh-dl">
      {rows.map(([label, value]) =>
      <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      )}
    </dl>);

}

function Status() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSystem().then(setInfo).catch((err) => setError(err.message));
  }, []);

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      const meta = await reloadArchive();
      setInfo((current) => ({ ...current, archive: meta }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!info) return error ? <p className="bh-error">{error}</p> : <p className="bh-sub">Loading…</p>;
  const { archive } = info;
  const source =
  archive.source === "neo4j" ?
  "Live Neo4j database" :
  `Snapshot — Neo4j was unreachable${archive.neo4jError ? ` (${archive.neo4jError})` : ""}`;

  return (
    <>
      <section className="bh-panel">
        <h2>Archive</h2>
        <Facts
          rows={[
          ["Source", source],
          ["Loaded", dateTime(archive.loadedAt)],
          ["Data as of", longDate(archive.takenAt)],
          ["Authors", archive.authors],
          ["Works", archive.works],
          ["Keywords", archive.keywords]]} />


        {error && <p className="bh-error" role="alert">{error}</p>}
        <div className="bh-actions">
          <button type="button" className="bh-btn" disabled={busy} onClick={reload}>
            {busy ? "Reloading…" : "Reload archive"}
          </button>
          <span className="bh-sub">If Neo4j is unreachable this takes up to 30 seconds, then falls back to the snapshot.</span>
        </div>
      </section>

      <section className="bh-panel">
        <h2>Files</h2>
        <Facts
          rows={[
          ["SQLite database", <code>{info.dbFile}</code>],
          ["Database size", size(info.dbBytes)],
          ["Upload folder", <code>{info.uploadDir}</code>],
          ["Live snapshot", <code>{info.liveSnapshot}</code>],
          ["Live snapshot saved", info.liveSnapshotExists ? "Yes" : "Not yet — written after the first successful Neo4j load"]]} />


      </section>

      <section className="bh-panel">
        <h2>Tools</h2>
        <Link className="bh-link" to="/configuration">Open the NeoViz query tool</Link>
      </section>
    </>);

}

export default function System() {
  const { account, loading } = useAccount();
  if (loading) return <div className="bh-empty bh-page-head">Loading&hellip;</div>;
  if (!account || !atLeast(account.role, "sysadmin")) {
    return <div className="bh-empty bh-page-head">You need to be a sysadmin to see this page.</div>;
  }
  return (
    <div className="bh-wide">
      <header className="bh-page-head">
        <h1 className="bh-h1">System</h1>
        <p className="bh-sub">Technical status for the people who run the server.</p>
      </header>
      <Status />
    </div>);

}
