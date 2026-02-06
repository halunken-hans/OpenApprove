import { app } from "./app.js";
import { env } from "./config.js";
import fs from "node:fs/promises";
import path from "node:path";

async function start() {
  await fs.mkdir(path.resolve(env.STORAGE_DIR), { recursive: true });
  app.listen(env.PORT, () => {
    console.log(`OpenApprove listening on ${env.PORT}`);
  });
}

start();
