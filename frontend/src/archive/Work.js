import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Cover from "./Cover";
import RichText from "./RichText";
import { getWork } from "./api";

export default function Work() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState("en");

  useEffect(() => {
    setData(null);
    setError(null);
    setLang("en");
    getWork(slug).then(setData).catch((e) => setError(e.message));
  }, [slug]);

  if (error) return <div className="bh-empty">{error}</div>;
  if (!data) return <div className="bh-empty">Loading&hellip;</div>;

  const { work, author } = data;
  const body = lang === "ur" ? work.urduInfo : work.engInfo;
  const keywords = lang === "ur" && work.keywordsUrdu.length ? work.keywordsUrdu : work.keywords;

  return (
    <>
      <div style={{ paddingTop: 26 }}>
        {author ? (
          <Link to={`/authors/${author.slug}`} className="bh-back">&#8249; {author.name}</Link>
        ) : (
          <Link to="/works" className="bh-back">&#8249; All works</Link>
        )}
      </div>

      <div className="bh-work-head">
        <h1 className="bh-h1">{work.title}</h1>
        <div className="bh-langs">
          <button
            type="button"
            className={lang === "en" ? "on" : undefined}
            onClick={() => setLang("en")}
            disabled={!work.engInfo}
          >
            English
          </button>
          <button
            type="button"
            className={lang === "ur" ? "on" : undefined}
            onClick={() => setLang("ur")}
            disabled={!work.urduInfo}
          >
            Urdu
          </button>
        </div>
      </div>

      <div className="bh-facts">
        {author && <span><b>{author.name}</b></span>}
        {work.year && <span>{work.year}</span>}
        {work.genre && <span>{work.genre}</span>}
        {work.magazine && <span>Published in <b>{work.magazine}</b></span>}
        {work.language && <span>{work.language}</span>}
      </div>

      {body ? (
        <RichText
          html={body}
          className={`bh-desc${lang === "ur" ? " ur" : ""}`}
          dir={lang === "ur" ? "rtl" : undefined}
        />
      ) : (
        <div className="bh-desc" style={{ textAlign: "center" }}>
          <span className="bh-pending">
            {lang === "ur" ? "Urdu description pending" : "English description pending"}
          </span>
        </div>
      )}

      <div className="bh-panel">
        <h2>Manuscript</h2>
        {work.images && work.images.length ? (
          <div className="bh-grid">
            {work.images.map((img, i) => (
              <div key={i} className="bh-figure">
                <Cover src={img.src} label={work.title} alt={`${work.title}, page ${i + 1}`} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ maxWidth: 420 }}>
            <Cover
              src={null}
              label={work.title}
              note={work.hasScan ? "scan held, not yet published" : "no scan"}
            />
          </div>
        )}
      </div>

      <div className="bh-panel">
        <h2>Digitised text</h2>
        <span className="bh-pending">
          {work.hasText ? "Text held as a document, not yet imported" : "No digitised text"}
        </span>
      </div>

      {keywords.length > 0 && (
        <div className="bh-panel">
          <h2>Keywords</h2>
          <div className="bh-kw">
            {work.keywords.map((k, i) => (
              <Link key={k} to={`/works?kw=${encodeURIComponent(k)}`}>
                {lang === "ur" && work.keywordsUrdu[i] ? work.keywordsUrdu[i] : k}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
