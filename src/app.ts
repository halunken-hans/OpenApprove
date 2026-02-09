import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { resolve } from "node:path";
import { env } from "./config.js";
import { processesRouter } from "./routes/processes.js";
import { filesRouter } from "./routes/files.js";
import { tokensRouter } from "./routes/tokens.js";
import { approvalsRouter } from "./routes/approvals.js";
import { emailsRouter } from "./routes/emails.js";
import { auditRouter } from "./routes/audit.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { portalRouter } from "./routes/portal.js";
import { uiRouter } from "./routes/ui.js";

// OpenApprove is fully controlled via HTTP requests; emails are optional side effects.
export const app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX
}));

app.use(express.static(resolve(process.cwd(), "public")));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/processes", processesRouter);
app.use("/api/files", filesRouter);
app.use("/api/tokens", tokensRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/webhooks", webhooksRouter);
app.use("/api/portal", portalRouter);

app.use("/", uiRouter);
