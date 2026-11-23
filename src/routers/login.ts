import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { eq } from "drizzle-orm";
import { verify } from "argon2";
import jwt from "jsonwebtoken";
import z from "zod";
import { db } from "../database/client.ts";
import { users } from "../database/schema.ts";
import { env } from "../utils/env.ts";

export const loginRouter: FastifyPluginAsyncZod = async (server) => {
  server.post(
    "/sessions",
    {
      schema: {
        tags: ["Auth"],
        summary: "Authenticate user",
        headers: z
          .object({
            "x-platform": z.enum(["web", "mobile"]).optional(),
          })
          .optional(),
        body: z.object({
          email: z.email("E-mail é obrigatório"),
          password: z.string("A senha é obrigatória"),
        }),
        response: {
          200: z.object({ token: z.string() }),
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const result = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      const user = result[0];

      if (!user) {
        return reply.status(401).send({ message: "Credenciais inválidas" });
      }

      const passwordMatches = await verify(user.password, password);

      if (!passwordMatches) {
        return reply.status(401).send({ message: "Credenciais inválidas" });
      }

      const token = jwt.sign(
        { sub: user.id, role: user.role },
        env.JWT_TOKEN,
      );

      const platform = request.headers["x-platform"];

      if (platform === "web") {
        reply.setCookie("token", token, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
      }

      return reply.status(200).send({ token });
    },
  );
};
