const EDGE_PUNCT = /^[.,;:،۔]+|[.,;:،۔]+$/g;

function cleanSurface(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(EDGE_PUNCT, "");
}

function normKey(s) {
  return cleanSurface(s).toLowerCase();
}

function cleanList(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((raw) => {
    const surface = cleanSurface(raw);
    const key = surface.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(surface);
  });
  return out;
}

function cleanPair(en, ur) {
  const enArr = Array.isArray(en) ? en : [];
  const urArr = Array.isArray(ur) ? ur : [];

  if (!urArr.length) return { en: cleanList(enArr), ur: [], aligned: true };
  if (enArr.length !== urArr.length) {
    return { en: cleanList(enArr), ur: cleanList(urArr), aligned: false };
  }

  const outEn = [];
  const outUr = [];
  const seen = new Set();
  for (let i = 0; i < enArr.length; i++) {
    const surface = cleanSurface(enArr[i]);
    const key = surface.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    outEn.push(surface);
    outUr.push(cleanSurface(urArr[i]));
  }
  return { en: outEn, ur: outUr, aligned: true };
}

function canonicalise(list, vocabMap) {
  const cleaned = cleanList(list);
  const matched = [];
  const created = [];
  const out = cleaned.map((surface) => {
    const existing = vocabMap.get(surface.toLowerCase());
    if (existing) {
      matched.push({ submitted: surface, canonical: existing });
      return existing;
    }
    created.push(surface);
    return surface;
  });
  return { keywords: out, matched, created };
}

function mergeKeywords(existing, incoming) {
  const out = [];
  const seen = new Set();
  [...(existing || []), ...(incoming || [])].forEach((raw) => {
    const surface = cleanSurface(raw);
    const key = surface.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(surface);
  });
  return out;
}

module.exports = { cleanSurface, normKey, cleanList, cleanPair, canonicalise, mergeKeywords };
