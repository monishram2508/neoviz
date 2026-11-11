import { fold, matches, firstLetter, duplicateKeys } from "./search";

test("duplicateKeys finds titles shared by more than one record, ignoring case and spaces", () => {
  const works = [{ title: "Mundadugu" }, { title: " mundadugu" }, { title: "Zindagi" }];
  expect([...duplicateKeys(works, "title")]).toEqual(["mundadugu"]);
});

test("fold strips diacritics and case", () => {
  expect(fold("  Bayāz-e-Hayāt ")).toBe("bayaz-e-hayat");
});

test("matches ignores diacritics and checks every field", () => {
  expect(matches("hayat", "Bayāz-e-Hayāt")).toBe(true);
  expect(matches("bano", "Aiwan-e-Ghazal", "Jeelani Bano")).toBe(true);
  expect(matches("xyz", "Aiwan-e-Ghazal", "Jeelani Bano")).toBe(false);
});

test("empty query matches everything", () => {
  expect(matches("", "anything")).toBe(true);
  expect(matches("   ", "anything")).toBe(true);
});

test("firstLetter skips leading punctuation and folds accents", () => {
  expect(firstLetter("Āmina")).toBe("A");
  expect(firstLetter("“Zindagi”")).toBe("Z");
  expect(firstLetter("p.satyavati")).toBe("P");
});

test("firstLetter buckets digits and non-Latin script under #", () => {
  expect(firstLetter("1857")).toBe("#");
  expect(firstLetter("جیلانی بانو")).toBe("#");
  expect(firstLetter("")).toBe("#");
});
