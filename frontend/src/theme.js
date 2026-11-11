import { useEffect, useState } from "react";

const KEY = "neoviz_theme";

export const getTheme = () => {
  const stored = localStorage.getItem(KEY);
  return stored === "dark" ? "dark" : "light";
};

const apply = (t) => {document.documentElement.dataset.theme = t;};

export function useTheme() {
  const [theme, setTheme] = useState(getTheme);

  useEffect(() => {apply(theme);}, [theme]);

  const toggle = () => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem(KEY, next);
      return next;
    });
  };

  return [theme, toggle];
}

apply(getTheme());
