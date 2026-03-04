import Fastify from "fastify";
import { env } from "./env.js";
import { processQueuedReminders, runDailyJobs } from "./jobs.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true, now: new Date().toISOString() }));

app.post("/jobs/run", async (request, reply) => {
  const token = request.headers["x-job-token"];
  if (token !== env.jobToken) {
    return reply.code(401).send({ ok: false });
  }

  const daily = await runDailyJobs();
  const queued = await processQueuedReminders();
  return { ok: true, daily, queued };
});

app.post("/jobs/send-reminders", async (request, reply) => {
  const token = request.headers["x-job-token"];
  if (token !== env.jobToken) {
    return reply.code(401).send({ ok: false });
  }
  const queued = await processQueuedReminders();
  return { ok: true, queued };
});

app.listen({ port: env.port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
