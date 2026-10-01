import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Node 20+ can load a local .env file without a runtime dependency. Render
// supplies its variables directly, so this only matters for local execution.
process.loadEnvFile?.(path.resolve(__dirname, ".env"));

await import("./src/server.js");
