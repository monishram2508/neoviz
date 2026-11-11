export const fold = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export const matches = (query, ...fields) => {
  const q = fold(query);
  return !q || fields.some((f) => fold(f).includes(q));
};

export const firstLetter = (s) => {
  const c = fold(s).replace(/^[^a-z0-9]+/, "").charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
};

export const keyOf = (s) => String(s || "").trim().toLowerCase();

export const duplicateKeys = (items, field) => {
  const counts = items.reduce((seen, item) => {
    const key = keyOf(item[field]);
    return seen.set(key, (seen.get(key) || 0) + 1);
  }, new Map());
  return new Set([...counts].filter(([, n]) => n > 1).map(([key]) => key));
};
