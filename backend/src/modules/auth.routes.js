import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { audit, hashPassword, requireAuth, signAccessToken, signRefreshToken, verifyPassword } from "../core/auth.js";
import { HttpError } from "../core/http.js";
import { User } from "../core/models.js";
import { isEmailConfigured, sendPasswordResetEmail } from "../services/mailer.service.js";
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
authRoutes.post("/forgot-password", validate(z.object({ body: z.object({ email: z.string().trim().email() }) })), async (req, res, next) => {
    try {
        if (!await isEmailConfigured())
            throw new HttpError(503, "Password reset email service is not configured. Please contact support.", "EMAIL_NOT_CONFIGURED");
        const user = await User.findOne({ email: req.body.email.toLowerCase(), status: "ACTIVE" });
        if (!user) {
            return res.json({ message: "Password reset link has been sent to your email." });
        }
        const token = randomBytes(32).toString("hex");
        user.passwordResetTokenHash = createHash("sha256").update(token).digest("hex");
        user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();
        const appUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
        try {
            await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl: `${appUrl}/reset-password?token=${token}` });
        }
        catch (error) {
            user.passwordResetTokenHash = undefined;
            user.passwordResetExpiresAt = undefined;
            await user.save();
            throw error;
        }
        await audit(user.id, "PASSWORD_RESET_REQUESTED", "User", user.id);
        res.json({ message: "Password reset link has been sent to your email." });
    }
    catch (error) {
        next(error);
    }
});
authRoutes.post("/reset-password", validate(z.object({ body: z.object({ token: z.string().length(64), password: z.string().min(8).max(128) }) })), async (req, res, next) => {
    try {
        const tokenHash = createHash("sha256").update(req.body.token).digest("hex");
        const user = await User.findOne({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() } });
        if (!user)
            throw new HttpError(400, "This password-reset link is invalid or has expired.", "INVALID_RESET_TOKEN");
        user.passwordHash = await hashPassword(req.body.password);
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpiresAt = undefined;
        await user.save();
        await audit(user.id, "PASSWORD_RESET_COMPLETED", "User", user.id);
        res.json({ message: "Your password has been reset. Please sign in." });
    }
    catch (error) {
        next(error);
    }
});authRoutes.post("/refresh", async (req, res, next) => {
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
const profileUpdateSchema = z.object({
    body: z.object({
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email(),
        currentPassword: z.string().optional(),
        newPassword: z.string().min(8).max(128).optional()
    }).refine((data) => Boolean(data.currentPassword) === Boolean(data.newPassword), {
        message: "Enter both your current password and a new password to change it.",
        path: ["newPassword"]
    })
});
authRoutes.patch("/me", requireAuth, validate(profileUpdateSchema), async (req, res, next) => {
    try {
        const { name, email, currentPassword, newPassword } = req.body;
        const normalizedEmail = email.toLowerCase();
        const user = await User.findById(req.user.id).orFail();
        if (normalizedEmail !== user.email) {
            const emailInUse = await User.exists({ email: normalizedEmail, _id: { $ne: user.id } });
            if (emailInUse)
                throw new HttpError(409, "That email address is already in use.", "EMAIL_IN_USE");
        }
        if (newPassword) {
            if (!(await verifyPassword(user.passwordHash, currentPassword)))
                throw new HttpError(400, "Your current password is incorrect.", "INVALID_CURRENT_PASSWORD");
            user.passwordHash = await hashPassword(newPassword);
        }
        user.name = name;
        user.email = normalizedEmail;
        await user.save();
        await audit(user.id, "PROFILE_UPDATED", "User", user.id, { passwordChanged: Boolean(newPassword) });
        res.json({ id: user.id, name: user.name, email: user.email, role: user.role, platformType: user.platformType ?? "SCRIPT_RECORDING", recordingMode: user.recordingMode ?? "SCRIPTED", vendorId: user.vendorId?.toString() });
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
