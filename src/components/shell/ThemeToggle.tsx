"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem("aomi:theme", theme);
  } catch {
    // Private mode without storage: the class on <html> still applies for this page.
  }
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const update = (next: Theme) => {
    applyTheme(next);
    setTheme(next);
  };

  return [theme, update];
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? "Aktifkan tema gelap" : "Aktifkan tema terang"}
      title={next === "dark" ? "Tema gelap" : "Tema terang"}
      className={className}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className="truncate">{theme === "dark" ? "Tema gelap" : "Tema terang"}</span>
    </button>
  );
}
