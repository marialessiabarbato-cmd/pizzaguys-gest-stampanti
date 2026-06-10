import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

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
  const secret = process.env.JWT_SECRET ?? "dev-secret-change-me";
  await app.register(import("@fastify/jwt"), { secret });

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify<JwtUser>();
    } catch {
      reply.status(401).send({ error: "Non autorizzato", code: "UNAUTHORIZED" });
    }
  });
});
