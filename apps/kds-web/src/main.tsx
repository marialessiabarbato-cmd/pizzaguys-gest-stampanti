import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "@pizzaguys/ui";
import App from "./App";
import "./index.css";

function DarkDefault({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  useEffect(() => setTheme("dark"), [setTheme]);
  return children;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <DarkDefault>
        <App />
      </DarkDefault>
    </ThemeProvider>
  </StrictMode>,
);
