import { Server } from "socket.io";
import { corsOptions } from "../core/cors.js";
export function attachRealtime(httpServer) {
    const io = new Server(httpServer, {
        cors: corsOptions
    });
    io.on("connection", (socket) => {
        socket.on("session:join", ({ sessionId, participantLabel }) => {
            socket.join(`session:${sessionId}`);
            io.to(`session:${sessionId}`).emit("session:presence", { participantLabel, connection: "CONNECTED" });
        });
        socket.on("session:ready", ({ sessionId, participantLabel, checks }) => {
            io.to(`session:${sessionId}`).emit("session:ready", { participantLabel, checks });
        });
        socket.on("session:countdown", ({ sessionId, seconds = 5 }) => {
            socket.to(`session:${sessionId}`).emit("session:countdown", { seconds });
        });
        socket.on("session:upload-complete", ({ sessionId, participantLabel }) => {
            io.to(`session:${sessionId}`).emit("session:upload-complete", { participantLabel });
        });
        socket.on("upload:progress", ({ sessionId, uploadId, progress }) => {
        socket.on("session:webrtc", ({ sessionId, type, payload }) => {
            if (!sessionId || !["offer", "answer", "ice"].includes(type)) return;
            socket.to(`session:${sessionId}`).emit("session:webrtc", { type, payload });
        });
            io.to(`session:${sessionId}`).emit("upload:progress", { uploadId, progress });
        });
    });
    return io;
}
