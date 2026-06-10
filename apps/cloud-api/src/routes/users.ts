import { users } from "@pizzaguys/db/schema";
import { createUserAdminSchema, updateUserAdminSchema } from "@pizzaguys/validators";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { generateApiToken } from "../lib/tokens.js";

function randomPassword() {
  return `Pg${generateApiToken().slice(0, 12)}!`;
}

export async function userRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get<{ Querystring: { locationId?: string } }>("/api/v2/users", guard, async (req) => {
    const rows = await app.db.query.users.findMany({
      where: req.query.locationId
        ? and(eq(users.role, "USER_ADMIN"), eq(users.locationId, req.query.locationId))
        : eq(users.role, "USER_ADMIN"),
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
    });
    return rows;
  });

  app.post("/api/v2/users", guard, async (req, reply) => {
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

    const password = parsed.data.password ?? randomPassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const pinHash = await bcrypt.hash(parsed.data.pin, 12);

    const [row] = await app.db
      .insert(users)
      .values({
        email: parsed.data.email,
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        role: "USER_ADMIN",
        locationId: parsed.data.locationId,
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

    await writeAudit(app, {
      userId: req.user.sub,
      locationId: parsed.data.locationId,
      operation: "user_admin.create",
      nextState: { id: row?.id, email: row?.email },
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

    const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.pin) {
      patch.pinHash = await bcrypt.hash(parsed.data.pin, 12);
      delete patch.pin;
    }

    const [row] = await app.db
      .update(users)
      .set(patch)
      .where(and(eq(users.id, req.params.id), eq(users.role, "USER_ADMIN")))
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

    await writeAudit(app, {
      userId: req.user.sub,
      locationId: row.locationId ?? undefined,
      operation: "user_admin.update",
      nextState: row,
    });

    return row;
  });
}
