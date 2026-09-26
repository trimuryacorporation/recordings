import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { audit, requireAuth, signAccessToken, signRefreshToken, verifyPassword } from "../core/auth.js";
import { HttpError } from "../core/http.js";
import { User } from "../core/models.js";
import { validate } from "../core/validate.js";
export const authRoutes = Router();
authRoutes.post("/login", validate(z.object({ body: z.object({ email: z.string().email(), password: z.string().min(8) }) })), async (req, res, next) => {
    try {
        const user = await User.findOne({ email: req.body.email.trim().toLowerCase(), status: "ACTIVE" });
        if (!user || !(await verifyPassword(user.passwordHash, req.body.password))) {
            throw new HttpError(401, "Invalid email or password.", "INVALID_CREDENTIALS");
        }
        const payload = { id: user.id, email: user.email, role: user.role, platformType: user.platformType ?? "SCRIPT_RECORDING", recordingMode: user.recordingMode ?? "SCRIPTED", vendorId: user.vendorId?.toString() };
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);
        await audit(user.id, "LOGIN", "User", user.id);
        res
            .cookie("accessToken", accessToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
            .json({ accessToken, refreshToken, user: payload, name: user.name });
    }
    catch (error) {
        next(error);
    }
});
authRoutes.post("/refresh", async (req, res, next) => {
    try {
        const token = req.body.refreshToken ?? req.cookies?.refreshToken;
        if (!token)
            throw new HttpError(401, "Please login again.", "AUTH_REQUIRED");
        const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET ?? "development-only-refresh-secret");
        const user = await User.findById(decoded.sub).orFail();
        const payload = { id: user.id, email: user.email, role: user.role, platformType: user.platformType ?? "SCRIPT_RECORDING", recordingMode: user.recordingMode ?? "SCRIPTED", vendorId: user.vendorId?.toString() };
        res.json({ accessToken: signAccessToken(payload), user: payload });
    }
    catch (error) {
        next(error);
    }
});
authRoutes.post("/logout", requireAuth, async (req, res) => {
    await audit(req.user?.id, "LOGOUT", "User", req.user?.id);
    res.clearCookie("accessToken").json({ ok: true });
});
authRoutes.get("/me", requireAuth, async (req, res) => {
    const user = await User.findById(req.user.id).select("name email role platformType recordingMode vendorId");
    res.json(user);
});
