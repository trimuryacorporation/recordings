import "./core/env.js";
import crypto from "node:crypto";
import http from "node:http";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import swaggerUi from "swagger-ui-express";
import { friendlyError } from "./core/http.js";
import { connectMongo, disconnectMongo } from "./core/mongo.js";
import { RecordingTask, Script } from "./core/models.js";
import { openApiDocument } from "./core/openapi.js";
import { authRoutes } from "./modules/auth.routes.js";
import { platformRoutes } from "./modules/platform.routes.js";
import { attachRealtime } from "./realtime/socket.js";
const app = express();
// Render provides its listening port through PORT. Keep BACKEND_PORT for local development.
const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 4000);
app.use(helmet());
const allowedOrigins = [...new Set([
    "http://localhost:5173",
    "https://records.trimuryacorporation.in",
    ...(process.env.APP_URL ?? "").split(",").map((origin) => origin.trim()).filter(Boolean)
])];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("dev"));
app.get("/", (_req, res) => res.json({
    ok: true,
    service: "TRT Tools API",
    health: "/health",
    status: "/api/status",
    docs: "/api/docs"
}));
app.get("/health", (_req, res) => res.json({ ok: true, service: "TRT Tools API" }));
app.get("/api/status", (_req, res) => res.json({
    ok: mongoose.connection.readyState === 1,
    service: "TRT Tools API",
    version: openApiDocument.info.version,
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
}));
app.get("/api/openapi.json", (_req, res) => res.json(openApiDocument));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/api/auth", authRoutes);
app.use("/api", platformRoutes);
app.use((err, _req, res, _next) => {
    const { status, body } = friendlyError(err);
    res.status(status).json(body);
});
const server = http.createServer(app);
app.set("io", attachRealtime(server));
await connectMongo();
const scriptsWithoutTasks = await Script.aggregate([
    { $lookup: { from: "recordingtasks", localField: "_id", foreignField: "scriptId", as: "tasks" } },
    { $match: { tasks: { $size: 0 } } },
    { $project: { _id: 1, projectId: 1, recordingType: 1 } }
]);
if (scriptsWithoutTasks.length) {
    await RecordingTask.insertMany(scriptsWithoutTasks.map((script) => ({
        taskCode: `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        projectId: script.projectId,
        scriptId: script._id,
        recordingType: script.recordingType,
        status: "UNASSIGNED"
    })));
    console.log(`Created ${scriptsWithoutTasks.length} missing recording tasks.`);
}
server.listen(port, () => {
    console.log(`TRT Tools API running on http://localhost:${port}`);
});
process.on("SIGINT", async () => {
    await disconnectMongo();
    server.close();
});
export { app };
