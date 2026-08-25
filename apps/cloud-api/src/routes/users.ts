import { locations, users } from "@pizzaguys/db/schema";
import { createUserAdminSchema, updateUserAdminSchema } from "@pizzaguys/validators";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { writeAudit } from "../lib/audit.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";
import { generateApiToken } from "../lib/tokens.js";

const CLOUD_ROLES = ["USER_ADMIN", "CASHIER", "WAITER", "SUPER_ADMIN"] as const;
const STAFF_ROLES = ["USER_ADMIN", "CASHIER", "WAITER"] as const;

const importStaffSchema = z.object({
  locationId: z.string().uuid(),
  staff: z
    .array(
      z.object({
        id: z.string().uuid(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(STAFF_ROLES),
        pinHash: z.string().min(10),
        isActive: z.boolean().default(true),
      }),
    )
    .min(1),
});

async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== "SUPER_ADMIN") {
    return reply.status(403).send({ error: "Solo SuperAdmin", code: "FORBIDDEN" });
  }
}

function randomPassword() {
  return `Pg${generateApiToken().slice(0, 12)}!`;
}

async function bumpForLocation(app: FastifyInstance, locationId: string | null | undefined) {
  if (!locationId) return;
  const location = await app.db.query.locations.findFirst({
    where: eq(locations.id, locationId),
    columns: { brandId: true },
  });
  if (location) await bumpSchemaVersion(app, location.brandId);
}

export async function userRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get<{ Querystring: { locationId?: string } }>("/api/v2/users", guard, async (req) => {
    const rows = await app.db.query.users.findMany({
      where: req.query.locationId
        ? and(
            inArray(users.role, [...CLOUD_ROLES]),
            eq(users.locationId, req.query.locationId),
          )
        : inArray(users.role, [...CLOUD_ROLES]),
      columns: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        locationId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: (u, { asc }) => [asc(u.lastName), asc(u.firstName)],
    });
    return rows;
  });

  /** Importa staff edge (stesso id + pinHash) come utenti cloud della sede. */
  app.post(
    "/api/v2/users/import-staff",
    { preHandler: [app.authenticate, requireSuperAdmin] },
    async (req, reply) => {
      const parsed = importStaffSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
      }

      const location = await app.db.query.locations.findFirst({
        where: eq(locations.id, parsed.data.locationId),
      });
      if (!location) return reply.status(404).send({ error: "Sede non trovata" });

      let created = 0;
      let updated = 0;

      for (const member of parsed.data.staff) {
        const existing = await app.db.query.users.findFirst({
          where: eq(users.id, member.id),
        });

        if (existing) {
          await app.db
            .update(users)
            .set({
              firstName: member.firstName,
              lastName: member.lastName,
              role: member.role,
              locationId: parsed.data.locationId,
              pinHash: member.pinHash,
              isActive: member.isActive,
              updatedAt: new Date(),
            })
            .where(eq(users.id, member.id));
          updated += 1;
          continue;
        }

        const email = `staff.${member.id.slice(0, 8)}@${location.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}.pizzaguys.local`;
        const passwordHash = await bcrypt.hash(randomPassword(), 12);

        await app.db.insert(users).values({
          id: member.id,
          email,
          passwordHash,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          locationId: parsed.data.locationId,
          pinHash: member.pinHash,
          isActive: member.isActive,
        });
        created += 1;
      }

      await bumpSchemaVersion(app, location.brandId);
      await writeAudit(app, {
        userId: req.user.sub,
        locationId: location.id,
        operation: "user.import_staff",
        nextState: { created, updated, locationId: location.id },
      });

      return { ok: true, created, updated, locationId: location.id };
    },
  );

  app.post("/api/v2/users", { preHandler: [app.authenticate, requireSuperAdmin] }, async (req, reply) => {
    const parsed = createUserAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const existing = await app.db.query.users.findFirst({
      where: eq(users.email, parsed.data.email),
    });
    if (existing) {
      return reply.status(409).send({ error: "Email già registrata" });
    }

    const role = parsed.data.role;
    const locationId = role === "SUPER_ADMIN" ? null : (parsed.data.locationId ?? null);
    const password = parsed.data.password ?? randomPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash = parsed.data.pin ? await bcrypt.hash(parsed.data.pin, 12) : null;

    const [row] = await app.db
      .insert(users)
      .values({
        email: parsed.data.email,
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        role,
        locationId,
        pinHash,
      })
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        locationId: users.locationId,
        isActive: users.isActive,
        createdAt: users.createdAt,
      });

    await bumpForLocation(app, locationId);

    await writeAudit(app, {
      userId: req.user.sub,
      locationId: locationId ?? undefined,
      operation: "user.create",
      nextState: { id: row?.id, email: row?.email, role: row?.role },
    });

    return reply.status(201).send({
      user: row,
      password,
      warning: "Salvare la password ora: non sarà più mostrata",
    });
  });

  app.patch<{ Params: { id: string } }>("/api/v2/users/:id", guard, async (req, reply) => {
    const parsed = updateUserAdminSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const existing = await app.db.query.users.findFirst({
      where: and(eq(users.id, req.params.id), inArray(users.role, [...CLOUD_ROLES])),
    });
    if (!existing) return reply.status(404).send({ error: "Utente non trovato" });

    const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.pin) {
      patch.pinHash = await bcrypt.hash(parsed.data.pin, 12);
      delete patch.pin;
    }

    const [row] = await app.db
      .update(users)
      .set(patch)
      .where(eq(users.id, req.params.id))
      .returning({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        locationId: users.locationId,
        isActive: users.isActive,
      });

    if (!row) return reply.status(404).send({ error: "Utente non trovato" });

    await bumpForLocation(app, row.locationId ?? existing.locationId);

    await writeAudit(app, {
      userId: req.user.sub,
      locationId: row.locationId ?? undefined,
      operation: "user_admin.update",
      nextState: row,
    });

    return row;
  });

  app.delete<{ Params: { id: string } }>(
    "/api/v2/users/:id",
    { preHandler: [app.authenticate, requireSuperAdmin] },
    async (req, reply) => {
      if (req.params.id === req.user.sub) {
        return reply.status(400).send({ error: "Non puoi eliminare il tuo account" });
      }

      const existing = await app.db.query.users.findFirst({
        where: and(eq(users.id, req.params.id), inArray(users.role, [...CLOUD_ROLES])),
      });
      if (!existing) return reply.status(404).send({ error: "Utente non trovato" });

      if (existing.role === "SUPER_ADMIN") {
        const superAdmins = await app.db.query.users.findMany({
          where: and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)),
          columns: { id: true },
        });
        if (superAdmins.length <= 1) {
          return reply
            .status(400)
            .send({ error: "Deve restare almeno un Super Admin attivo" });
        }
      }

      await app.db.delete(users).where(eq(users.id, req.params.id));
      await bumpForLocation(app, existing.locationId);

      await writeAudit(app, {
        userId: req.user.sub,
        locationId: existing.locationId ?? undefined,
        operation: "user.delete",
        severity: "CRITICAL",
        previousState: {
          id: existing.id,
          email: existing.email,
          firstName: existing.firstName,
          lastName: existing.lastName,
          role: existing.role,
        },
      });

      return { ok: true };
    },
  );
}
