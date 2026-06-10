import { useCallback, useEffect, useState } from "react";
import { Shell, type EdgePage } from "./components/Shell";
import { edgeApi } from "./lib/api";
import { CassaPage } from "./pages/CassaPage";
import { PrintersPage } from "./pages/PrintersPage";
import { ProvisionPage } from "./pages/ProvisionPage";
import { RoutingPage } from "./pages/RoutingPage";
import { SalaPage } from "./pages/SalaPage";
import { StaffPage } from "./pages/StaffPage";

interface Status {
  status: string;
  locationName?: string;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [page, setPage] = useState<EdgePage>("cassa");

  const refresh = useCallback(async () => {
    try {
      const s = await edgeApi<Status>("/api/status");
      setStatus(s);
    } catch {
      setStatus({ status: "offline" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!status) {
    return <main className="flex min-h-screen items-center justify-center p-6">Caricamento...</main>;
  }

  if (status.status !== "ACTIVE") {
    return <ProvisionPage onDone={() => void refresh()} />;
  }

  if (page === "cassa") {
    return (
      <CassaPage locationName={status.locationName} onAdmin={() => setPage("sala")} />
    );
  }

  const content = {
    sala: <SalaPage />,
    stampanti: <PrintersPage />,
    routing: <RoutingPage />,
    staff: <StaffPage />,
  }[page];

  return (
    <Shell page={page} onPage={setPage} locationName={status.locationName}>
      {content}
    </Shell>
  );
}
