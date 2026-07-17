import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredTheme } from "./components/layout/ThemeToggle";

// החלת ערכת הנושא לפני הרינדור — מונע הבזק לבן
applyStoredTheme();

createRoot(document.getElementById("root")!).render(<App />);
