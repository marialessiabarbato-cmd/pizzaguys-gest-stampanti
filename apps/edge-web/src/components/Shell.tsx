import { Button, useTheme } from "@pizzaguys/ui";

export type EdgePage = "cassa" | "sala" | "stampanti" | "routing" | "staff";

const NAV: { id: EdgePage; label: string }[] = [
  { id: "cassa", label: "Cassa" },
  { id: "sala", label: "Sala" },
  { id: "stampanti", label: "Stampanti" },
  { id: "routing", label: "Routing" },
  { id: "staff", label: "Staff" },
];

export function Shell({
  page,
  onPage,
  locationName,
  children,
}: {
  page: EdgePage;
  onPage: (p: EdgePage) => void;
  locationName?: string;
  children: React.ReactNode;
}) {
  const { toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 border-r border-[hsl(var(--pg-border))] p-4">
        <p className="mb-1 text-lg font-bold">Main Station</p>
        {locationName && (
          <p className="mb-6 text-xs text-[hsl(var(--pg-muted-foreground))]">{locationName}</p>
        )}
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPage(item.id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                page === item.id
                  ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                  : "hover:bg-[hsl(var(--pg-muted))]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-8 border-t border-[hsl(var(--pg-border))] pt-4">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
            Account
          </p>
          <Button variant="outline" className="w-full" onClick={toggleTheme}>
            Tema
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
