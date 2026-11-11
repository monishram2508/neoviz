import { formErrors, toPayload } from "./ContributionForm";

test("client validation mirrors the server limits", () => {
  expect(formErrors("note", {}, "work").length).toBeGreaterThan(0);
  expect(formErrors("note", { bodyUrdu: "یاد" }, "work")).toEqual([]);
  expect(formErrors("citation", { source: "S", url: "javascript:x" }, "work").length).toBeGreaterThan(0);
  expect(formErrors("correction", { field: "bio", value: "v" }, "author").length).toBeGreaterThan(0);
});

test("keyword boxes become one keyword per line", () => {
  expect(toPayload("add_keywords", { keywords: " memory \n\nexile, home ", keywordsUrdu: "" })).toEqual({
    keywords: ["memory", "exile, home"],
    keywordsUrdu: []
  });
});
