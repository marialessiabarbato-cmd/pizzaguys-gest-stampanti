import { variantGroups, variants } from "@pizzaguys/db/schema";
import { createVariantGroupSchema, createVariantSchema } from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { getDefaultBrand } from "../lib/brand.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";

export async function variantRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get("/api/v2/variant-groups", guard, async () => {
    const brand = await getDefaultBrand(app.db);
    const groups = await app.db.query.variantGroups.findMany({
      where: eq(variantGroups.brandId, brand.id),
    });
    const allVariants = groups.length
      ? await app.db.query.variants.findMany()
      : [];
    return groups.map((g) => ({
      ...g,
      variants: allVariants.filter((v) => v.groupId === g.id),
    }));
  });

  app.post("/api/v2/variant-groups", guard, async (req, reply) => {
    const parsed = createVariantGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const [row] = await app.db
      .insert(variantGroups)
      .values({
        brandId: brand.id,
        name: parsed.data.name,
        categoryIds: parsed.data.categoryIds,
      })
      .returning();
    await bumpSchemaVersion(app, brand.id);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/v2/variant-groups/:id", guard, async (req, reply) => {
    const parsed = createVariantGroupSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .update(variantGroups)
      .set(parsed.data)
      .where(eq(variantGroups.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Gruppo non trovato" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/v2/variant-groups/:id", guard, async (req, reply) => {
    const [row] = await app.db
      .delete(variantGroups)
      .where(eq(variantGroups.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Gruppo non trovato" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "variant_group.delete",
      severity: "WARNING",
      previousState: row,
    });
    return { ok: true };
  });

  app.post("/api/v2/variants", guard, async (req, reply) => {
    const parsed = createVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .insert(variants)
      .values({
        groupId: parsed.data.groupId,
        name: parsed.data.name,
        type: parsed.data.type,
        priceDelta: String(parsed.data.priceDelta),
      })
      .returning();
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/v2/variants/:id", guard, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    if (body.priceDelta != null) body.priceDelta = Number(body.priceDelta);
    const parsed = createVariantSchema.partial().omit({ groupId: true }).safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const [row] = await app.db
      .update(variants)
      .set({
        ...parsed.data,
        priceDelta: parsed.data.priceDelta != null ? String(parsed.data.priceDelta) : undefined,
      })
      .where(eq(variants.id, req.params.id))
      .returning();
    if (!row) return reply.status(404).send({ error: "Variante non trovata" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/v2/variants/:id", guard, async (req, reply) => {
    const [row] = await app.db.delete(variants).where(eq(variants.id, req.params.id)).returning();
    if (!row) return reply.status(404).send({ error: "Variante non trovata" });
    const brand = await getDefaultBrand(app.db);
    await bumpSchemaVersion(app, brand.id);
    return { ok: true };
  });

  /**
   * Import one-shot (CSV per ora — colonne Excel-ready).
   * Header: groupName,optionName,type,priceDelta
   */
  app.post("/api/v2/variants/import", guard, async (req, reply) => {
    const body = req.body as { csv?: string; content?: string };
    const raw = typeof body?.csv === "string" ? body.csv : typeof body?.content === "string" ? body.content : "";
    if (!raw.trim()) {
      return reply.status(400).send({ error: "CSV mancante (campo csv o content)" });
    }

    const lines = raw
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return reply.status(400).send({ error: "CSV vuoto o solo header" });
    }

    const header = lines[0]!.toLowerCase().split(/[,;]/).map((h) => h.trim());
    const idx = {
      groupName: header.indexOf("groupname"),
      optionName: header.indexOf("optionname"),
      type: header.indexOf("type"),
      priceDelta: header.indexOf("pricedelta"),
    };
    if (idx.groupName < 0 || idx.optionName < 0 || idx.type < 0 || idx.priceDelta < 0) {
      return reply.status(400).send({
        error: "Colonne richieste: groupName,optionName,type,priceDelta",
      });
    }

    const brand = await getDefaultBrand(app.db);
    const existingGroups = await app.db.query.variantGroups.findMany({
      where: eq(variantGroups.brandId, brand.id),
    });
    const groupByName = new Map(
      existingGroups.map((g) => [localizedIt(g.name).toLowerCase(), g]),
    );

    let createdGroups = 0;
    let createdOptions = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]!);
      const groupName = (cols[idx.groupName] ?? "").trim();
      const optionName = (cols[idx.optionName] ?? "").trim();
      const typeRaw = (cols[idx.type] ?? "").trim().toUpperCase();
      const priceRaw = (cols[idx.priceDelta] ?? "0").trim().replace(",", ".");
      if (!groupName || !optionName) {
        errors.push(`Riga ${i + 1}: groupName/optionName mancanti`);
        continue;
      }
      const type = typeRaw === "REMOVE" ? "REMOVE" : typeRaw === "ADD" ? "ADD" : null;
      if (!type) {
        errors.push(`Riga ${i + 1}: type deve essere ADD o REMOVE`);
        continue;
      }
      const priceDelta = Number.parseFloat(priceRaw);
      if (!Number.isFinite(priceDelta) || priceDelta < 0) {
        errors.push(`Riga ${i + 1}: priceDelta non valido`);
        continue;
      }

      let group = groupByName.get(groupName.toLowerCase());
      if (!group) {
        const [created] = await app.db
          .insert(variantGroups)
          .values({
            brandId: brand.id,
            name: { it: groupName },
            categoryIds: [],
          })
          .returning();
        if (!created) {
          errors.push(`Riga ${i + 1}: creazione gruppo fallita`);
          continue;
        }
        group = created;
        groupByName.set(groupName.toLowerCase(), created);
        createdGroups += 1;
      }

      await app.db.insert(variants).values({
        groupId: group.id,
        name: { it: optionName },
        type,
        priceDelta: String(Math.round(priceDelta * 100) / 100),
      });
      createdOptions += 1;
    }

    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "variants.import",
      nextState: { createdGroups, createdOptions, errors: errors.length },
    });

    return {
      ok: true,
      createdGroups,
      createdOptions,
      errors,
    };
  });
}

function localizedIt(name: Record<string, string> | unknown): string {
  if (name && typeof name === "object" && "it" in name) {
    return String((name as Record<string, string>).it ?? "");
  }
  return String(name ?? "");
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === "," || ch === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}
