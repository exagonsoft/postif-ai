"use client";

import React, { createContext, useContext, useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
});

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("postif-theme", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("postif-theme", callback); };
}
function snapshot(): Theme { return window.localStorage.getItem("postifai-theme") === "light" ? "light" : "dark"; }
function serverSnapshot(): Theme { return "dark"; }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    window.localStorage.setItem("postifai-theme", theme === "dark" ? "light" : "dark");
    window.dispatchEvent(new Event("postif-theme"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
