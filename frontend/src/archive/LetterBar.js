import React from "react";

const ALPHABET = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const MIN_ITEMS = 24;

export const showLetters = (query, count) => !query && count > MIN_ITEMS;

const jump = (letter) => {
  const target = document.querySelector(`[data-letter="${letter}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function LetterBar({ letters }) {
  const keys = letters.has("#") ? [...ALPHABET, "#"] : ALPHABET;
  return (
    <nav className="bh-letters" aria-label="Jump to letter">
      {keys.map((l) => (
        <button key={l} type="button" disabled={!letters.has(l)} onClick={() => jump(l)}>
          {l}
        </button>
      ))}
    </nav>
  );
}
