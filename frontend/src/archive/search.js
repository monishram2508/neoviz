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
