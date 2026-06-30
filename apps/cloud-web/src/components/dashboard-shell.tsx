"use client";

import { Button, useTheme } from "@pizzaguys/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/locations", label: "Sedi" },
  { href: "/closures", label: "Chiusure & Report" },
  { href: "/menu", label: "Menu" },
  { href: "/users", label: "Utenti" },
  { href: "/settings", label: "Impostazioni" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleTheme } = useTheme();

  const logout = () => {
    clearToken();
    router.push("/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-[hsl(var(--pg-border))] p-4">
        <p className="mb-6 text-lg font-bold">Pizza Guys</p>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                  ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                  : "hover:bg-[hsl(var(--pg-muted))]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 space-y-2">
          <Button variant="outline" className="w-full" onClick={toggleTheme}>
            Tema
          </Button>
          <Button variant="ghost" className="w-full" onClick={logout}>
            Esci
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
