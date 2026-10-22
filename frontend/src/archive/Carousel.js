import React, { useCallback, useEffect, useRef, useState } from "react";

export default function Carousel({ slides, title, subtitle, interval = 6000 }) {
  const [i, setI] = useState(0);
  const timer = useRef(null);
  const n = slides.length;

  const go = useCallback((next) => setI(((next % n) + n) % n), [n]);

  useEffect(() => {
    if (n < 2) return undefined;
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return undefined;
    timer.current = setInterval(() => setI((c) => (c + 1) % n), interval);
    return () => clearInterval(timer.current);
  }, [n, interval]);

  const pause = () => clearInterval(timer.current);

  if (!n) return null;

  return (
    <div className="bh-hero" onMouseEnter={pause}>
      <div className="bh-hero-stage">
        {slides.map((s, idx) => (
          <div key={s.id} className={`bh-hero-slide${idx === i ? " on" : ""}`} aria-hidden={idx !== i}>
            {s.src ? (
              <img src={s.src} alt={s.caption || ""} />
            ) : (
              <div className="bh-cover-ph" style={{ width: "100%", height: "100%" }}>
                {!s.showTitle && (
                  <>
                    <span className="glyph">&#10023;</span>
                    <span className="note">{s.caption}</span>
                  </>
                )}
              </div>
            )}
          </div>
        ))}

        {slides[i] && slides[i].showTitle && (
          <div className="bh-hero-title" style={slides[i].src ? undefined : { filter: "none" }}>
            <h1 style={slides[i].src ? undefined : { color: "var(--brand)", textShadow: "none" }}>{title}</h1>
            <p style={slides[i].src ? undefined : { color: "var(--ink-soft)", textShadow: "none" }}>{subtitle}</p>
          </div>
        )}

        {!slides[i].src && <span className="bh-hero-note">image pending</span>}

        {n > 1 && (
          <>
            <button type="button" className="bh-hero-nav prev" onClick={() => go(i - 1)} aria-label="Previous">
              &#8249;
            </button>
            <button type="button" className="bh-hero-nav next" onClick={() => go(i + 1)} aria-label="Next">
              &#8250;
            </button>
            <div className="bh-hero-dots">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  className={idx === i ? "on" : undefined}
                  onClick={() => go(idx)}
                  aria-label={`Slide ${idx + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
