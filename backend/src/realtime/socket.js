import { Server } from "socket.io";
export function attachRealtime(httpServer) {
    const io = new Server(httpServer, {
        cors: { origin: process.env.APP_URL ?? "http://localhost:5173", credentials: true }
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
            io.to(`session:${sessionId}`).emit("upload:progress", { uploadId, progress });
        });
    });
    return io;
}
