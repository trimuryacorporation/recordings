import path from "node:path";
import { fileURLToPath } from "node:url";
function backendRoot() {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return currentDir.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(currentDir, "../../..")
        : path.resolve(currentDir, "../..");
}
// Keep local development self-contained while avoiding a startup dependency
// on dotenv in production. Hosting providers inject environment variables.
process.loadEnvFile?.(path.resolve(backendRoot(), ".env"));
