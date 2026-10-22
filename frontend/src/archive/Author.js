import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Carousel from "./Carousel";
import Cover from "./Cover";
import { getAuthor } from "./api";

export default function Author() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    getAuthor(slug).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="bh-empty">{error}</div>;
  if (!data) return <div className="bh-empty">Loading&hellip;</div>;

  const { author, works } = data;
  const portraits = author.portraits && author.portraits.length
    ? author.portraits.map((p, i) => ({ id: `p${i}`, src: p.src, caption: p.caption }))
    : [{ id: "p0", src: null, caption: `Photographs of ${author.name}` }];

  return (
    <>
      <div className="bh-page-head">
        <Link to="/authors" className="bh-back">&#8249; All authors</Link>
        <h1 className="bh-h1">{author.name}</h1>
        <p className="bh-sub">
          {works.length} {works.length === 1 ? "work" : "works"}
          {author.language ? ` · ${author.language}` : ""}
        </p>
      </div>

      <div className="bh-split">
        <div>
          {portraits.length > 1 ? (
            <Carousel slides={portraits} interval={7000} />
          ) : (
            <div className="bh-figure">
              <Cover src={portraits[0].src} label={author.name} portrait note="portrait pending" />
            </div>
          )}
          <div className="bh-figure" style={{ marginTop: 16 }}>
            <div className="bh-figcap">
              {author.bio || <span className="bh-pending">Biography pending</span>}
            </div>
          </div>
        </div>

        <div>
          {works.length === 0 ? (
            <div className="bh-empty">No works recorded for this author yet.</div>
          ) : (
            <div className="bh-grid">
              {works.map((w) => (
                <Link key={w.slug} to={`/works/${w.slug}`} className="bh-card">
                  <Cover src={null} label={w.title} note={w.hasScan ? "scan pending" : "no scan"} />
                  <div className="bh-card-body">
                    <p className="bh-card-title">{w.title}</p>
                    <p className="bh-card-meta">
                      {[w.year, w.genre].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <span className="bh-card-view">View</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
