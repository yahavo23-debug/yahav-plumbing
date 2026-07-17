import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * מצב כהה/בהיר לכל המערכת. ברירת המחדל: כהה (לוק שחור יוקרתי).
 * הבחירה נשמרת במכשיר (localStorage) — כל מכשיר יכול להעדיף מצב אחר.
 */

const STORAGE_KEY = "yahav-theme";

export function applyStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  const dark = stored ? stored === "dark" : true; // ברירת מחדל: כהה
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
  }, [dark]);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "עבור למצב בהיר" : "עבור למצב כהה"}
      title={dark ? "מצב בהיר" : "מצב כהה"}
      onClick={() => setDark((d) => !d)}
      className="shrink-0"
    >
      {dark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
    </Button>
  );
}
