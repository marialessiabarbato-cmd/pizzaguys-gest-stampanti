import { categoryRouting, type EdgeDatabase, type WorkCenter } from "@pizzaguys/edge-db";
import { getMenuSnapshot } from "./provision.js";

type RoutingSnapshot = { products?: { id: string; categoryId?: string }[] };

/**
 * Centro di produzione di un prodotto secondo lo smistamento categorie
 * (Main Station → Routing). Senza regola per la categoria: PIZZERIA.
 */
export function createWorkCenterResolver(edgeDb: EdgeDatabase): (productId?: string) => WorkCenter {
  const snapshot = getMenuSnapshot(edgeDb)?.snapshot as RoutingSnapshot | undefined;
  const routing = edgeDb.select().from(categoryRouting).all();
  return (productId) => {
    const categoryId = snapshot?.products?.find((p) => p.id === productId)?.categoryId;
    return routing.find((r) => r.categoryId === categoryId)?.workCenter ?? "PIZZERIA";
  };
}
