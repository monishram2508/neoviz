import React from "react";

const initials = (text) =>
  String(text || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export default function Cover({ src, alt, label, note, portrait = false }) {
  const cls = `bh-cover${portrait ? " portrait" : ""}`;
  if (src) {
    return (
      <div className={cls}>
        <img src={src} alt={alt || ""} loading="lazy" />
      </div>
    );
  }
  return (
    <div className={cls}>
      <div className="bh-cover-ph">
        <span className="glyph">{initials(label)}</span>
        <span className="note">{note || "image pending"}</span>
      </div>
    </div>
  );
}
