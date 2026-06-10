"use client";

import { ThemeProvider } from "@pizzaguys/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
