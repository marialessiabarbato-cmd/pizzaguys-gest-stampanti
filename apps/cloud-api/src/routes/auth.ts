import { users } from "@pizzaguys/db/schema";
import { superAdminLoginSchema } from "@pizzaguys/validators";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/v2/auth/login", async (req, reply) => {
    const parsed = superAdminLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Credenziali non valide", details: parsed.error.flatten() });
    }

    const user = await app.db.query.users.findFirst({
      where: eq(users.email, parsed.data.email),
    });

    if (!user || !user.isActive || user.role !== "SUPER_ADMIN") {
      return reply.status(401).send({ error: "Email o password errati", code: "INVALID_CREDENTIALS" });
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Email o password errati", code: "INVALID_CREDENTIALS" });
    }

    const token = app.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: "8h" },
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  });

  app.get("/api/v2/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    const user = await app.db.query.users.findFirst({
      where: eq(users.id, req.user.sub),
      columns: { passwordHash: false, pinHash: false },
    });
    return { user };
  });
}
