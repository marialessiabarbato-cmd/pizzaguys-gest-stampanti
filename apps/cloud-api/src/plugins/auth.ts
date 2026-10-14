import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { resolveJwtSecret } from "../lib/jwt-secret.js";

export interface JwtUser {
  sub: string;
  email: string;
  role: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  const check = resolveJwtSecret();
  if (!check.ok) throw new Error(check.error);
  if (check.warning) app.log.warn(check.warning);
  await app.register(import("@fastify/jwt"), { secret: check.secret });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify<JwtUser>();
    } catch {
      reply.status(401).send({ error: "Non autorizzato", code: "UNAUTHORIZED" });
    }
  });
});
