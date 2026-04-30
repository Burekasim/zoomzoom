import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "zz_theme";

const apply = (t: Theme) => document.documentElement.setAttribute("data-theme", t);

const initial = (): Theme => {
  const saved = localStorage.getItem(KEY) as Theme | null;
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(initial);

  useEffect(() => {
    apply(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-label="Toggle color scheme"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
};
