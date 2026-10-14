import { useEffect, useState } from "react";
import { edgeApi } from "./api";

/**
 * Piattaforme delivery configurate in Cloud Admin → Impostazioni → Delivery
 * (`deliveryBrokers` di brand_settings), lette dallo snapshot menu dell'Edge.
 * In caso di errore o snapshot assente restituisce una lista vuota.
 */
export function useDeliveryBrokers(): string[] {
  const [brokers, setBrokers] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    edgeApi<{ snapshot?: { settings?: { deliveryBrokers?: string[] } } }>("/api/menu")
      .then((m) => {
        if (!cancelled) setBrokers(m.snapshot?.settings?.deliveryBrokers ?? []);
      })
      .catch(() => {
        if (!cancelled) setBrokers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return brokers;
}
