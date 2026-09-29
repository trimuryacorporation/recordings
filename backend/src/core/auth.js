import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { HttpError } from "./http.js";
import { AuditLog } from "./models.js";
const accessSecret = () => process.env.JWT_SECRET ?? "development-only-secret";
const refreshSecret = () => process.env.JWT_REFRESH_SECRET ?? "development-only-refresh-secret";
export async function hashPassword(password) {
    return argon2.hash(password);
}
export async function verifyPassword(hash, password) {
    return argon2.verify(hash, password);
}
export function signAccessToken(user) {
    return jwt.sign(user, accessSecret(), { expiresIn: "15m" });
}
export function signRefreshToken(user) {
    return jwt.sign({ sub: user.id }, refreshSecret(), { expiresIn: "7d" });
}
export async function requireAuth(req, _res, next) {
    try {
        const bearer = req.headers.authorization?.replace("Bearer ", "");
        const token = bearer ?? req.cookies?.accessToken;
        if (!token)
            throw new HttpError(401, "Please login to continue.", "AUTH_REQUIRED");
        req.user = jwt.verify(token, accessSecret());
        next();
    }
    catch {
        next(new HttpError(401, "Your session has expired. Please login again.", "AUTH_INVALID"));
    }
}
export const allowRoles = (...allowed) => (req, _res, next) => {
    if (!req.user)
        return next(new HttpError(401, "Please login to continue.", "AUTH_REQUIRED"));
    if (!allowed.includes(req.user.role)) {
        return next(new HttpError(403, "You do not have access to this action.", "FORBIDDEN"));
    }
    next();
};
export async function audit(actorId, action, entity, entityId, metadata, ip) {
    await AuditLog.create({ actorId, action, entity, entityId, ip, metadata: metadata ?? {} });
}
