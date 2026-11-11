import { atLeast, safeNext } from "./account";

test("atLeast follows the four-role ladder", () => {
  expect(atLeast("sysadmin", "admin")).toBe(true);
  expect(atLeast("moderator", "admin")).toBe(false);
  expect(atLeast(undefined, "contributor")).toBe(true);
});

test("safeNext only returns paths on this site", () => {
  expect(safeNext("/contribute?work=first-work")).toBe("/contribute?work=first-work");
  expect(safeNext("//evil.example")).toBe("/");
  expect(safeNext("https://evil.example")).toBe("/");
  expect(safeNext(null)).toBe("/");
});
