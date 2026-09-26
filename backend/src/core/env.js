import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
function backendRoot() {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return currentDir.includes(`${path.sep}dist${path.sep}`)
        ? path.resolve(currentDir, "../../..")
        : path.resolve(currentDir, "../..");
}
dotenv.config({ path: path.resolve(backendRoot(), ".env") });
