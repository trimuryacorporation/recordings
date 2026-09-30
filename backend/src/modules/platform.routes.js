import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router } from "express";
import { z } from "zod";
import { allowRoles, audit, hashPassword, requireAuth, signAccessToken } from "../core/auth.js";
import { HttpError } from "../core/http.js";
import { languageCatalog } from "../core/languages.js";
import { AppSetting, AuditLog, Client, Invitation, Invoice, ManualRecording, MediaFile, Notification, Project, QaReview, Recording, RecordingSession, RecordingTask, RecordingTrack, Script, ScriptVersion, User, Vendor, VendorPayment } from "../core/models.js";
import { toObjectId } from "../core/mongo.js";
import { assertSessionTransition, assertTaskTransition } from "../core/state-machines.js";
import { validate } from "../core/validate.js";
import { storageProvider } from "../storage/storage.service.js";
function maskConfiguredValue(value) {
    return value ? `${"•".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : "";
}
function settingsPayload(settings) {
    const payload = json(settings);
    const smtpPassword = payload.smtpPassword;
    delete payload.smtpPassword;
    return {
        ...payload,
        smtpPasswordConfigured: Boolean(smtpPassword),
        smtpPasswordMasked: maskConfiguredValue(smtpPassword),
        r2Endpoint: process.env.S3_ENDPOINT ?? "",
        r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
        r2AccessKeyConfigured: Boolean(process.env.S3_ACCESS_KEY),
        r2SecretKeyConfigured: Boolean(process.env.S3_SECRET_KEY)
    };
}
async function saveR2Environment(values) {
    const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
    let content = await fs.readFile(envPath, "utf8").catch(() => "");
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === "") continue;
        const line = `${key}=${JSON.stringify(value)}`;
        const expression = new RegExp(`^${key}=.*$`, "m");
        content = expression.test(content) ? content.replace(expression, line) : `${content.trimEnd()}\n${line}\n`;
        process.env[key] = value;
    }
    await fs.writeFile(envPath, content, "utf8");
}
export const platformRoutes = Router();
platformRoutes.post("/invitations/:token/guest-accept", async (req, res) => {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const invitation = await Invitation.findOne({ tokenHash });
    if (!invitation || !["PENDING", "ACCEPTED"].includes(invitation.status) || (invitation.expiresAt && invitation.expiresAt < new Date()))
        throw new HttpError(410, "This invitation is expired or no longer valid.", "INVITATION_INVALID");
    const session = invitation.sessionId
        ? await RecordingSession.findById(invitation.sessionId).orFail()
        : await RecordingSession.findOne({ taskId: invitation.taskId }).sort({ createdAt: -1 }).orFail();
    invitation.status = "ACCEPTED";
    invitation.acceptedAt ??= new Date();
    await invitation.save();
    const guest = { role: "GUEST", platformType: "DUAL_RECORDING", sessionId: session.id, participantRole: "B" };
    res.json({ accessToken: signAccessToken(guest), user: { ...guest, name: "Participant B" }, sessionId: session.id, taskId: invitation.taskId ? String(invitation.taskId) : null, participantRole: "B" });
});
platformRoutes.use(requireAuth);
platformRoutes.get("/search", async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) return res.json([]);
    const regex = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const [projects, scripts, tasks, users, vendors] = await Promise.all([
        Project.find({ $or: [{ name: regex }, { code: regex }] }).select("name code").limit(5),
        Script.find({ $or: [{ title: regex }, { scriptCode: regex }] }).select("title scriptCode").limit(5),
        RecordingTask.find({ taskCode: regex }).select("taskCode status").limit(5),
        User.find({ $or: [{ name: regex }, { email: regex }] }).select("name email").limit(5),
        Vendor.find({ $or: [{ companyName: regex }, { email: regex }] }).select("companyName email").limit(5)
    ]);
    res.json([
        ...projects.map((row) => ({ id: row.id, type: "Project", title: row.name, detail: row.code, path: "/app/projects" })),
        ...scripts.map((row) => ({ id: row.id, type: "Script", title: row.title, detail: row.scriptCode, path: "/app/scripts" })),
        ...tasks.map((row) => ({ id: row.id, type: "Task", title: row.taskCode, detail: row.status, path: "/app/tasks" })),
        ...users.map((row) => ({ id: row.id, type: "User", title: row.name, detail: row.email, path: "/app/users" })),
        ...vendors.map((row) => ({ id: row.id, type: "Vendor", title: row.companyName, detail: row.email, path: "/app/vendors" }))
    ]);
});
const publicUser = "name email role platformType recordingMode vendorId languages status lastActiveAt phone mobile";
const pageArgs = (query) => {
    const page = Number(query.page ?? 1);
    const pageSize = Math.min(Number(query.pageSize ?? 20), 100);
    return { skip: (page - 1) * pageSize, limit: pageSize };
};
const json = (doc) => JSON.parse(JSON.stringify(doc));
platformRoutes.get("/languages", async (_req, res) => res.json(await languageCatalog()));
async function projectPayload(project) {
    const row = json(project);
    row.client = project.clientId ? json(project.clientId) : undefined;
    row.vendor = project.vendorId ? json(project.vendorId) : undefined;
    row._count = {
        scripts: await Script.countDocuments({ projectId: project.id }),
        tasks: await RecordingTask.countDocuments({ projectId: project.id }),
        sessions: await RecordingSession.countDocuments({ projectId: project.id })
    };
    return row;
}
async function taskPayload(task) {
    const row = json(task);
    row.project = task.projectId ? json(task.projectId) : undefined;
    row.script = task.scriptId ? json(task.scriptId) : undefined;
    row.vendor = task.vendorId ? json(task.vendorId) : undefined;
    row.participantA = task.participantAId ? json(task.participantAId) : undefined;
    row.participantB = task.participantBId ? json(task.participantBId) : undefined;
    return row;
}
function sessionRole(session, user) {
    if (user?.role === "GUEST" && user?.participantRole === "B" && String(user?.sessionId) === String(session.id)) return "B";
    if (String(session.participantAId) === String(user?.id)) return "A";
    if (String(session.participantBId) === String(user?.id)) return "B";
    return null;
}
function requireSessionParticipant(session, user, requiredRole) {
    const role = sessionRole(session, user);
    if (!role || (requiredRole && role !== requiredRole))
        throw new HttpError(403, requiredRole === "A" ? "Only Participant A can control this session." : "This session is not assigned to you.", "FORBIDDEN");
    return role;
}
async function recordingPayload(recording) {
    const row = json(recording);
    row.project = recording.projectId ? json(recording.projectId) : undefined;
    row.task = recording.taskId ? json(recording.taskId) : undefined;
    row.session = recording.sessionId ? json(recording.sessionId) : undefined;
    row.tracks = await RecordingTrack.find({ recordingId: recording.id }).populate("mediaFileId").sort({ createdAt: -1 });
    row.qaReviews = await QaReview.find({ recordingId: recording.id }).sort({ createdAt: -1 });
    return row;
}
platformRoutes.get("/dashboard", async (_req, res) => {
    const isVendor = _req.user.role === "VENDOR";
    const vendorId = toObjectId(_req.user.vendorId);
    if (isVendor && !vendorId) {
        return res.json({
            cards: { totalProjects: 0, activeProjects: 0, totalRecordings: 0, pendingQa: 0, approved: 0, rejected: 0, activeUsers: 0, activeVendors: 0 },
            charts: { recordingVolume: [], taskStatus: [] },
            tables: { recentProjects: [], pendingQueue: [], activeDualSessions: [] }
        });
    }
    const projectScope = isVendor ? { vendorId } : {};
    const recordingScope = isVendor ? { vendorId } : {};
    const taskScope = isVendor ? { $or: [
        { vendorId },
        { status: "UNASSIGNED" }
    ] } : {};
    const vendorTaskIds = isVendor ? (await RecordingTask.find(taskScope).select("_id")).map((task) => task._id) : null;
    const [totalProjects, activeProjects, totalRecordings, pendingQa, approved, rejected, activeUsers, activeVendors] = await Promise.all([
        Project.countDocuments(projectScope),
        Project.countDocuments({ ...projectScope, status: "ACTIVE" }),
        Recording.countDocuments(recordingScope),
        Recording.countDocuments({ ...recordingScope, qaStatus: "QA_PENDING" }),
        Recording.countDocuments({ ...recordingScope, qaStatus: "APPROVED" }),
        Recording.countDocuments({ ...recordingScope, qaStatus: "REJECTED" }),
        User.countDocuments(isVendor ? { vendorId, role: "RECORDER", status: "ACTIVE" } : { status: "ACTIVE" }),
        Vendor.countDocuments(isVendor ? { _id: vendorId, status: "ACTIVE" } : { status: "ACTIVE" })
    ]);
    const recentProjectDocs = await Project.find(projectScope).populate("clientId").populate("vendorId").sort({ createdAt: -1 }).limit(5);
    const pendingDocs = await RecordingTask.find({ ...taskScope, status: "QA_PENDING" }).populate("projectId").populate("scriptId").populate("vendorId").sort({ createdAt: -1 }).limit(5);
    const activeDualSessions = await RecordingSession.find({ recordingType: "DUAL", status: { $in: ["WAITING_FOR_PARTICIPANTS", "READY", "RECORDING"] }, ...(vendorTaskIds ? { taskId: { $in: vendorTaskIds } } : {}) }).sort({ createdAt: -1 }).limit(5);
    const taskStatus = await RecordingTask.aggregate([{ $match: taskScope }, { $group: { _id: "$status", _count: { $sum: 1 } } }, { $project: { status: "$_id", _count: 1, _id: 0 } }]);
    const recordingVolume = await Recording.aggregate([{ $match: recordingScope }, { $group: { _id: "$qaStatus", _count: { $sum: 1 } } }, { $project: { qaStatus: "$_id", _count: 1, _id: 0 } }]);
    res.json({
        cards: { totalProjects, activeProjects, totalRecordings, pendingQa, approved, rejected, activeUsers, activeVendors },
        charts: { recordingVolume, taskStatus },
        tables: {
            recentProjects: await Promise.all(recentProjectDocs.map(projectPayload)),
            pendingQueue: await Promise.all(pendingDocs.map(taskPayload)),
            activeDualSessions
        }
    });
});
platformRoutes.get("/clients", async (_req, res) => res.json(await Client.find().sort({ name: 1 })));
const vendorInputSchema = z.object({
    companyName: z.string().trim().min(2).max(150),
    contactPerson: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    phone: z.string().trim().max(30).optional().default(""),
    country: z.string().trim().max(80).optional().default(""),
    address: z.string().trim().max(300).optional().default(""),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});
platformRoutes.get("/vendors", async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const where = {
        ...(req.user.role === "VENDOR" ? { _id: toObjectId(req.user.vendorId) } : {}),
        ...(search ? { $or: ["companyName", "contactPerson", "email", "phone"].map((field) => ({ [field]: { $regex: escapedSearch, $options: "i" } })) } : {}),
        ...(typeof req.query.status === "string" && req.query.status ? { status: req.query.status } : {}),
        ...(typeof req.query.country === "string" && req.query.country ? { country: req.query.country } : {})
    };
    const vendors = await Vendor.find(where).sort({ companyName: 1 });
    res.json(await Promise.all(vendors.map(async (vendor) => ({ ...json(vendor), _count: { users: await User.countDocuments({ vendorId: vendor.id }), projects: await Project.countDocuments({ vendorId: vendor.id }), tasks: await RecordingTask.countDocuments({ vendorId: vendor.id }) } }))));
});
platformRoutes.post("/vendors", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = vendorInputSchema.parse(req.body);
    const vendor = await Vendor.create({ ...input, email: input.email.toLowerCase() });
    await audit(req.user?.id, "VENDOR_CREATED", "Vendor", vendor.id, { email: vendor.email });
    res.status(201).json(vendor);
});
platformRoutes.post("/vendors/bulk", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const inputs = z.array(vendorInputSchema).min(1).max(100).parse(req.body.vendors);
    const emails = inputs.map((input) => input.email.toLowerCase());
    if (new Set(emails).size !== emails.length) throw new HttpError(409, "Bulk list contains duplicate email addresses.", "DUPLICATE_VENDOR_EMAIL");
    const existing = await Vendor.findOne({ email: { $in: emails } }).select("email");
    if (existing) throw new HttpError(409, `A vendor with email ${existing.email} already exists.`, "VENDOR_EMAIL_EXISTS");
    const vendors = await Vendor.insertMany(inputs.map((input) => ({ ...input, email: input.email.toLowerCase() })));
    await audit(req.user?.id, "VENDORS_BULK_CREATED", "Vendor", vendors[0]?.id, { count: vendors.length });
    res.status(201).json({ created: vendors.length, vendors });
});
platformRoutes.patch("/vendors/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = vendorInputSchema.parse(req.body);
    const vendor = await Vendor.findByIdAndUpdate(req.params.id, { ...input, email: input.email.toLowerCase() }, { new: true, runValidators: true }).orFail();
    await audit(req.user?.id, "VENDOR_UPDATED", "Vendor", vendor.id, { email: vendor.email });
    res.json(vendor);
});
platformRoutes.delete("/vendors/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const [users, projects, tasks] = await Promise.all([
        User.countDocuments({ vendorId: req.params.id }),
        Project.countDocuments({ vendorId: req.params.id }),
        RecordingTask.countDocuments({ vendorId: req.params.id })
    ]);
    await Promise.all([
        User.updateMany({ vendorId: req.params.id }, { $unset: { vendorId: 1 } }),
        Project.updateMany({ vendorId: req.params.id }, { $unset: { vendorId: 1 } }),
        RecordingTask.updateMany({ vendorId: req.params.id }, { $unset: { vendorId: 1 } })
    ]);
    const vendor = await Vendor.findByIdAndDelete(req.params.id).orFail();
    await audit(req.user?.id, "VENDOR_DELETED", "Vendor", vendor.id, { email: vendor.email, detached: { users, projects, tasks } });
    res.json({ deleted: true });
});
const userInputSchema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email(),
    mobile: z.string().trim().min(8).max(20),
    password: z.string().min(8).max(128),
    role: z.enum(["SUPER_ADMIN", "ADMIN", "QA", "VENDOR", "RECORDER"]),
    platformType: z.enum(["SINGLE_RECORDING", "DUAL_RECORDING", "SCRIPT_RECORDING"]),
    recordingMode: z.enum(["SCRIPTED", "NON_SCRIPTED"]),
    languages: z.array(z.string().trim().min(2)).max(10).default([]),
    vendorId: z.string().optional().default(""),
    status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE")
});
platformRoutes.get("/users", async (req, res) => {
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = req.user.role === "VENDOR" ? (actor?.vendorId ?? req.user.vendorId) : null;
    const { skip, limit } = pageArgs(req.query);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const where = {
        deletedAt: { $exists: false },
        ...(search ? { $or: ["name", "email", "mobile", "phone"].map((field) => ({ [field]: { $regex: escapedSearch, $options: "i" } })) } : {}),
        ...(typeof req.query.role === "string" && req.query.role ? { role: req.query.role } : {}),
        ...(typeof req.query.status === "string" && req.query.status ? { status: req.query.status } : {}),
        ...(typeof req.query.platformType === "string" && req.query.platformType ? { platformType: req.query.platformType } : {}),
        ...(typeof req.query.vendorId === "string" && req.query.vendorId ? { vendorId: toObjectId(req.query.vendorId) } : {}),
        ...(req.user.role === "VENDOR" ? { $and: [{ $or: [
            ...(vendorId ? [{ vendorId: toObjectId(vendorId) }] : []),
            { createdById: toObjectId(req.user.id) }
        ] }], role: "RECORDER" } : {})
    };
    res.json(await User.find(where).select(publicUser).populate("vendorId", "companyName").sort({ createdAt: -1 }).skip(skip).limit(limit));
});
platformRoutes.post("/users", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res, next) => {
    try {
        const parsed = userInputSchema.parse(req.body);
        const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
        const vendorId = req.user.role === "VENDOR" ? (actor?.vendorId ?? req.user.vendorId) : parsed.vendorId;
        if (req.user.role === "VENDOR" && !vendorId) throw new HttpError(409, "Your vendor account is not linked. Please contact the administrator.", "VENDOR_NOT_LINKED");
        const input = req.user.role === "VENDOR" ? { ...parsed, role: "RECORDER", vendorId: String(vendorId) } : parsed;
        const { password, ...profile } = input;
        const user = await User.create({
            ...profile,
            email: input.email.toLowerCase(),
            phone: input.mobile,
            passwordHash: await hashPassword(password),
            vendorId: toObjectId(input.vendorId),
            createdById: toObjectId(req.user.id)
        });
        await audit(req.user?.id, "USER_CREATED", "User", user.id, { email: user.email, role: user.role });
        res.status(201).json(user);
    }
    catch (error) {
        next(error);
    }
});
platformRoutes.post("/users/bulk", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    const parsedInputs = z.array(userInputSchema).min(1).max(100).parse(req.body.users);
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = req.user.role === "VENDOR" ? (actor?.vendorId ?? req.user.vendorId) : null;
    if (req.user.role === "VENDOR" && !vendorId) throw new HttpError(409, "Your vendor account is not linked. Please contact the administrator.", "VENDOR_NOT_LINKED");
    const inputs = req.user.role === "VENDOR" ? parsedInputs.map((input) => ({ ...input, role: "RECORDER", vendorId: String(vendorId) })) : parsedInputs;
    const emails = inputs.map((input) => input.email.toLowerCase());
    if (new Set(emails).size !== emails.length) throw new HttpError(409, "Bulk list contains duplicate email addresses.", "DUPLICATE_USER_EMAIL");
    const existing = await User.findOne({ email: { $in: emails } }).select("email");
    if (existing) throw new HttpError(409, `A user with email ${existing.email} already exists.`, "USER_EMAIL_EXISTS");
    const rows = await Promise.all(inputs.map(async (input) => {
        const { password, ...profile } = input;
        return {
            ...profile,
            email: input.email.toLowerCase(),
            phone: input.mobile,
            passwordHash: await hashPassword(password),
            vendorId: toObjectId(input.vendorId),
            createdById: toObjectId(req.user.id)
        };
    }));
    const users = await User.insertMany(rows);
    await audit(req.user?.id, "USERS_BULK_CREATED", "User", users[0]?.id, { count: users.length });
    res.status(201).json({ created: users.length });
});
platformRoutes.patch("/users/:id", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    const target = await User.findById(req.params.id).orFail();
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const ownsTarget = (Boolean(vendorId) && Boolean(target.vendorId) && String(target.vendorId) === String(vendorId)) || String(target.createdById) === String(req.user.id);
    if (req.user.role === "VENDOR" && (target.role !== "RECORDER" || !ownsTarget)) throw new HttpError(403, "You can only edit users under your vendor account.", "FORBIDDEN");
    const parsed = userInputSchema.extend({ password: z.union([z.literal(""), z.string().min(8).max(128)]).optional() }).parse(req.body);
    const input = req.user.role === "VENDOR" ? { ...parsed, role: "RECORDER", vendorId: vendorId ? String(vendorId) : "" } : parsed;
    const update = {
        ...input,
        email: input.email.toLowerCase(),
        phone: input.mobile,
        vendorId: toObjectId(input.vendorId)
    };
    if (input.password) update.passwordHash = await hashPassword(input.password);
    delete update.password;
    if (!update.vendorId) delete update.vendorId;
    const vendorUpdate = input.vendorId ? { $set: update } : { $set: update, $unset: { vendorId: 1 } };
    const user = await User.findByIdAndUpdate(req.params.id, vendorUpdate, { new: true, runValidators: true }).select(publicUser).orFail();
    await audit(req.user?.id, "USER_UPDATED", "User", user.id, { email: user.email, role: user.role });
    res.json(user);
});
platformRoutes.delete("/users/:id", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    if (String(req.user?.id ?? req.user?.sub) === req.params.id) throw new HttpError(409, "You cannot delete your own account.", "CANNOT_DELETE_SELF");
    const user = await User.findById(req.params.id).orFail();
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const ownsUser = (Boolean(vendorId) && Boolean(user.vendorId) && String(user.vendorId) === String(vendorId)) || String(user.createdById) === String(req.user.id);
    if (req.user.role === "VENDOR" && (user.role !== "RECORDER" || !ownsUser)) throw new HttpError(403, "You can only delete users under your vendor account.", "FORBIDDEN");
    if (user.role === "SUPER_ADMIN" && await User.countDocuments({ role: "SUPER_ADMIN" }) <= 1) throw new HttpError(409, "The last Super Admin cannot be deleted.", "LAST_SUPER_ADMIN");
    await Promise.all([
        RecordingTask.updateMany({ participantAId: user.id }, { $unset: { participantAId: 1 } }),
        RecordingTask.updateMany({ participantBId: user.id }, { $unset: { participantBId: 1 } }),
        RecordingSession.updateMany({ participantAId: user.id }, { $unset: { participantAId: 1 } }),
        RecordingSession.updateMany({ participantBId: user.id }, { $unset: { participantBId: 1 } })
    ]);
    await User.findByIdAndDelete(user.id);
    await audit(req.user?.id, "USER_DELETED", "User", user.id, { email: user.email, role: user.role });
    res.json({ deleted: true });
});
platformRoutes.get("/projects", async (req, res) => {
    const { skip, limit } = pageArgs(req.query);
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const visibleProjectIds = req.user.role === "VENDOR"
        ? await RecordingTask.distinct("projectId", {
            deletedAt: { $exists: false },
            $or: [
                ...(vendorId ? [{ vendorId: toObjectId(vendorId) }] : []),
                { status: "UNASSIGNED" }
            ]
        })
        : null;
    const where = {
        ...(visibleProjectIds ? { _id: { $in: visibleProjectIds } } : {}),
        ...(typeof req.query.status === "string" ? { status: req.query.status } : {}),
        ...(typeof req.query.recordingType === "string" ? { recordingType: req.query.recordingType } : {})
    };
    const projects = await Project.find(where).populate("clientId").populate("vendorId").sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(await Promise.all(projects.map(projectPayload)));
});
platformRoutes.post("/projects", allowRoles("SUPER_ADMIN", "ADMIN"), validate(z.object({
    body: z.object({
        name: z.string().min(2),
        code: z.string().min(2),
        clientId: z.string().min(12),
        description: z.string().optional(),
        recordingType: z.enum(["SINGLE", "DUAL"]),
        scriptLanguage: z.string().min(2),
        targetRecordings: z.number().int().positive(),
        vendorId: z.string().min(12).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]).default("DRAFT")
    })
})), async (req, res) => {
    const project = await Project.create({ ...req.body, clientId: toObjectId(req.body.clientId), vendorId: toObjectId(req.body.vendorId) });
    await audit(req.user?.id, "PROJECT_CREATED", "Project", project.id, { code: project.code });
    res.status(201).json(project);
});
platformRoutes.get("/projects/:id", async (req, res) => {
    const project = await Project.findById(req.params.id).populate("clientId").populate("vendorId").orFail();
    const row = await projectPayload(project);
    row.scripts = await Script.find({ projectId: project.id });
    row.tasks = await RecordingTask.find({ projectId: project.id });
    row.sessions = await RecordingSession.find({ projectId: project.id });
    res.json(row);
});
platformRoutes.patch("/projects/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true }).orFail();
    await audit(req.user?.id, "PROJECT_UPDATED", "Project", project.id);
    res.json(project);
});
platformRoutes.get("/scripts", async (req, res) => {
    const { skip, limit } = pageArgs(req.query);
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const visibleScriptIds = req.user.role === "VENDOR"
        ? await RecordingTask.distinct("scriptId", {
            deletedAt: { $exists: false },
            $or: [
                ...(vendorId ? [{ vendorId: toObjectId(vendorId) }] : []),
                { status: "UNASSIGNED" }
            ]
        })
        : null;
    const scripts = await Script.find({ deletedAt: { $exists: false }, ...(visibleScriptIds ? { _id: { $in: visibleScriptIds } } : {}) }).populate("projectId").sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(await Promise.all(scripts.map(async (script) => ({ ...json(script), project: json(script.projectId), versions: await ScriptVersion.find({ scriptId: script.id }).sort({ version: -1 }).limit(3) }))));
});
platformRoutes.get("/scripts/search", async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 10;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const where = {
        deletedAt: { $exists: false },
        ...(search ? { $or: ["title", "scriptCode", "currentText"].map((field) => ({ [field]: { $regex: escapedSearch, $options: "i" } })) } : {}),
        ...(typeof req.query.projectId === "string" && req.query.projectId ? { projectId: toObjectId(req.query.projectId) } : {}),
        ...(typeof req.query.language === "string" && req.query.language ? { language: req.query.language } : {}),
        ...(typeof req.query.recordingType === "string" && req.query.recordingType ? { recordingType: req.query.recordingType } : {})
    };
    const [rows, total] = await Promise.all([
        Script.find(where).populate("projectId").sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
        Script.countDocuments(where)
    ]);
    res.json({
        items: rows.map((script) => ({ ...json(script), project: json(script.projectId) })),
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
    });
});
platformRoutes.post("/scripts", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const project = await Project.findById(req.body.projectId).orFail();
    if (project.recordingType !== req.body.recordingType)
        throw new HttpError(422, `Select a ${req.body.recordingType} project for this script.`, "RECORDING_TYPE_MISMATCH");
    const prefix = req.body.recordingType === "DUAL" ? "DUAL" : "SINGLE";
    const script = await Script.create({ ...req.body, scriptCode: `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, projectId: toObjectId(req.body.projectId), createdById: toObjectId(req.user?.id) });
    await ScriptVersion.create({ scriptId: script.id, version: script.version, text: script.currentText, createdBy: req.user?.email });
    await RecordingTask.create({
        taskCode: `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        projectId: project.id,
        scriptId: script.id,
        recordingType: script.recordingType,
        status: "UNASSIGNED"
    });
    await audit(req.user?.id, "SCRIPT_CREATED", "Script", script.id);
    res.status(201).json(script);
});
platformRoutes.post("/scripts/bulk", allowRoles("SUPER_ADMIN", "ADMIN"), validate(z.object({
    body: z.object({
        projectId: z.string().min(12),
        recordingType: z.enum(["SINGLE", "DUAL"]),
        language: z.string().trim().min(2).max(50),
        sourceName: z.string().trim().max(200).optional(),
        scripts: z.array(z.object({
            title: z.string().trim().max(200).optional(),
            text: z.string().trim().min(1).max(20000),
            expectedDuration: z.number().int().positive().max(3600).optional()
        })).min(1).max(1000)
    })
})), async (req, res, next) => {
    try {
        const projectId = toObjectId(req.body.projectId);
        const project = await Project.findById(projectId).orFail();
        if (project.recordingType !== req.body.recordingType)
            throw new HttpError(422, "Project and script recording types must match.", "RECORDING_TYPE_MISMATCH");
        const prefix = req.body.recordingType === "DUAL" ? "DUAL" : "SINGLE";
        const created = await Script.insertMany(req.body.scripts.map((row, index) => ({
            scriptCode: `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            projectId,
            title: row.title || `${prefix === "DUAL" ? "Dual" : "Single"} Script ${index + 1}`,
            category: prefix === "DUAL" ? "Conversation" : "Read-aloud",
            language: req.body.language,
            currentText: row.text,
            expectedDuration: row.expectedDuration ?? (prefix === "DUAL" ? 90 : 30),
            recordingType: req.body.recordingType,
            createdById: toObjectId(req.user?.id)
        })));
        await ScriptVersion.insertMany(created.map((script) => ({ scriptId: script.id, version: 1, text: script.currentText, createdBy: req.user?.email })));
        await RecordingTask.insertMany(created.map((script) => ({
            taskCode: `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            projectId,
            scriptId: script.id,
            recordingType: script.recordingType,
            status: "UNASSIGNED"
        })));
        await audit(req.user?.id, "SCRIPTS_BULK_UPLOADED", "Script", undefined, { count: created.length, recordingType: req.body.recordingType, sourceName: req.body.sourceName });
        res.status(201).json({ count: created.length, scripts: created });
    }
    catch (error) {
        next(error);
    }
});
platformRoutes.patch("/scripts/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const current = await Script.findOne({ _id: req.params.id, deletedAt: { $exists: false } }).orFail();
    const nextVersion = current.version + 1;
    const script = await Script.findByIdAndUpdate(current.id, { ...req.body, version: nextVersion }, { new: true }).orFail();
    if (req.body.currentText)
        await ScriptVersion.create({ scriptId: script.id, version: nextVersion, text: req.body.currentText, createdBy: req.user?.email });
    await audit(req.user?.id, "SCRIPT_UPDATED", "Script", script.id);
    res.json(script);
});
platformRoutes.delete("/scripts/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const script = await Script.findById(req.params.id).orFail();
    const taskIds = (await RecordingTask.find({ scriptId: script.id }).select("_id")).map((task) => task._id);
    const linkedRecordings = taskIds.length ? await Recording.find({ taskId: { $in: taskIds } }).select("_id sessionId") : [];
    const recordingIds = linkedRecordings.map((recording) => recording._id);
    const sessionIds = linkedRecordings.map((recording) => recording.sessionId).filter(Boolean);
    const deletedAudio = recordingIds.length ? await deleteRecordingMedia(recordingIds) : 0;
    if (sessionIds.length) await RecordingSession.updateMany({ _id: { $in: sessionIds } }, { $unset: { "syncMetadata.recordingId": 1 } });
    const [versions, tasks] = await Promise.all([
        ScriptVersion.deleteMany({ scriptId: script.id }),
        RecordingTask.deleteMany({ scriptId: script.id })
    ]);
    await Script.findByIdAndDelete(script.id);
    await audit(req.user?.id, "SCRIPT_DELETED", "Script", script.id, { permanent: true, deletedVersions: versions.deletedCount, deletedTasks: tasks.deletedCount, deletedAudio });
    res.json({ deleted: true, id: script.id, deletedVersions: versions.deletedCount, deletedTasks: tasks.deletedCount, deletedAudio });
});
platformRoutes.delete("/scripts", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const where = {
        deletedAt: { $exists: false },
        ...(search ? { $or: ["title", "scriptCode", "currentText"].map((field) => ({ [field]: { $regex: escapedSearch, $options: "i" } })) } : {}),
        ...(typeof req.query.projectId === "string" && req.query.projectId ? { projectId: toObjectId(req.query.projectId) } : {}),
        ...(typeof req.query.language === "string" && req.query.language ? { language: req.query.language } : {}),
        ...(typeof req.query.recordingType === "string" && req.query.recordingType ? { recordingType: req.query.recordingType } : {})
    };
    const scripts = await Script.find(where);
    await Promise.all(scripts.map((script) => deleteScriptPermanently(script, req.user)));
    await audit(req.user?.id, "SCRIPTS_BULK_DELETED", "Script", undefined, { count: scripts.length, filters: req.query });
    res.json({ deleted: scripts.length });
});
async function deleteScriptPermanently(script, user) {
    const taskIds = (await RecordingTask.find({ scriptId: script.id }).select("_id")).map((task) => task._id);
    const linkedRecordings = taskIds.length ? await Recording.find({ taskId: { $in: taskIds } }).select("_id sessionId") : [];
    const recordingIds = linkedRecordings.map((recording) => recording._id);
    const sessionIds = linkedRecordings.map((recording) => recording.sessionId).filter(Boolean);
    const deletedAudio = recordingIds.length ? await deleteRecordingMedia(recordingIds) : 0;
    if (sessionIds.length) await RecordingSession.updateMany({ _id: { $in: sessionIds } }, { $unset: { "syncMetadata.recordingId": 1 } });
    const [versions, tasks] = await Promise.all([
        ScriptVersion.deleteMany({ scriptId: script.id }),
        RecordingTask.deleteMany({ scriptId: script.id })
    ]);
    await Script.findByIdAndDelete(script.id);
    await audit(user?.id, "SCRIPT_DELETED", "Script", script.id, { permanent: true, deletedVersions: versions.deletedCount, deletedTasks: tasks.deletedCount, deletedAudio });
    return { deletedVersions: versions.deletedCount, deletedTasks: tasks.deletedCount, deletedAudio };
}
platformRoutes.get("/tasks", async (req, res) => {
    const { skip, limit } = pageArgs(req.query);
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const where = {
        deletedAt: { $exists: false },
        ...(typeof req.query.status === "string" ? { status: req.query.status } : {}),
        ...(typeof req.query.recordingType === "string" ? { recordingType: req.query.recordingType } : {}),
        ...(typeof req.query.projectId === "string" ? { projectId: toObjectId(req.query.projectId) } : {}),
        ...(typeof req.query.vendorId === "string" ? { vendorId: toObjectId(req.query.vendorId) } : {}),
        ...(req.user.role === "VENDOR" ? { $and: [{ $or: [
            ...(vendorId ? [{ vendorId: toObjectId(vendorId) }] : []),
            { status: "UNASSIGNED" }
        ] }] } : {}),
        ...(req.user.role === "RECORDER" ? { $and: [{ $or: [
            { participantAId: toObjectId(req.user.id) },
            { participantBId: toObjectId(req.user.id) }
        ] }] } : {})
    };
    const tasks = await RecordingTask.find(where).populate("projectId").populate("scriptId").populate("vendorId").populate("participantAId", publicUser).populate("participantBId", publicUser).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(await Promise.all(tasks.map(taskPayload)));
});
platformRoutes.get("/tasks/search", async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 100;
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let searchFilters = [];
    if (search) {
        const regex = { $regex: escapedSearch, $options: "i" };
        const [matchingScripts, matchingProjects, matchingUsers, matchingVendors] = await Promise.all([
            Script.find({ $or: [{ title: regex }, { scriptCode: regex }] }).select("_id"),
            Project.find({ $or: [{ name: regex }, { code: regex }] }).select("_id"),
            User.find({ $or: [{ name: regex }, { email: regex }] }).select("_id"),
            Vendor.find({ $or: [{ companyName: regex }, { contactPerson: regex }, { email: regex }] }).select("_id")
        ]);
        const userIds = matchingUsers.map((user) => user.id);
        searchFilters = [
            { taskCode: regex },
            { scriptId: { $in: matchingScripts.map((script) => script.id) } },
            { projectId: { $in: matchingProjects.map((project) => project.id) } },
            { vendorId: { $in: matchingVendors.map((vendor) => vendor.id) } },
            { participantAId: { $in: userIds } },
            { participantBId: { $in: userIds } }
        ];
    }
    const where = {
        deletedAt: { $exists: false },
        ...(searchFilters.length ? { $or: searchFilters } : {}),
        ...(typeof req.query.projectId === "string" && req.query.projectId ? { projectId: toObjectId(req.query.projectId) } : {}),
        ...(typeof req.query.vendorId === "string" && req.query.vendorId ? { vendorId: toObjectId(req.query.vendorId) } : {}),
        ...(typeof req.query.recordingType === "string" && req.query.recordingType ? { recordingType: req.query.recordingType } : {}),
        ...(typeof req.query.status === "string" && req.query.status ? { status: req.query.status } : {}),
        ...(req.user.role === "VENDOR" ? { $and: [{ $or: [
            ...(vendorId ? [{ vendorId: toObjectId(vendorId) }] : []),
            { status: "UNASSIGNED" }
        ] }] } : {}),
        ...(req.user.role === "RECORDER" ? { $and: [{ $or: [
            { participantAId: toObjectId(req.user.id) },
            { participantBId: toObjectId(req.user.id) }
        ] }] } : {})
    };
    const [rows, total] = await Promise.all([
        RecordingTask.find(where).populate("projectId").populate("scriptId").populate("vendorId").populate("participantAId", publicUser).populate("participantBId", publicUser).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
        RecordingTask.countDocuments(where)
    ]);
    res.json({ items: await Promise.all(rows.map(taskPayload)), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});
platformRoutes.get("/tasks/:id", async (req, res) => {
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    const task = await RecordingTask.findOne({
        _id: req.params.id,
        deletedAt: { $exists: false },
        ...(req.user.role === "VENDOR" ? { $or: [
            ...(vendorId ? [{ vendorId: toObjectId(vendorId) }] : []),
            { status: "UNASSIGNED" }
        ] } : {}),
        ...(req.user.role === "RECORDER" ? { $or: [
            { participantAId: toObjectId(req.user.id) },
            { participantBId: toObjectId(req.user.id) }
        ] } : {})
    })
        .populate("projectId")
        .populate("scriptId")
        .populate("vendorId")
        .populate("participantAId", publicUser)
        .populate("participantBId", publicUser)
        .orFail();
    res.json(await taskPayload(task));
});
platformRoutes.post("/tasks", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    const projectId = toObjectId(req.body.projectId);
    const scriptId = toObjectId(req.body.scriptId);
    const actor = req.user.role === "VENDOR" ? await User.findById(req.user.id).select("vendorId") : null;
    const vendorId = actor?.vendorId ?? req.user.vendorId;
    if (req.user.role === "VENDOR" && !vendorId) throw new HttpError(409, "Your vendor account is not linked. Please contact the administrator.", "VENDOR_NOT_LINKED");
    const [project, script] = await Promise.all([Project.findById(projectId).orFail(), Script.findById(scriptId).orFail()]);
    const unassigned = await RecordingTask.findOne({ scriptId, status: "UNASSIGNED", deletedAt: { $exists: false } });
    if (req.user.role === "VENDOR" && String(project.vendorId) !== String(vendorId) && !unassigned) throw new HttpError(403, "This script is no longer available for assignment.", "FORBIDDEN");
    if (project.recordingType !== req.body.recordingType || script.recordingType !== req.body.recordingType || String(script.projectId) !== String(projectId))
        throw new HttpError(422, "Project, script, and task recording types must match.", "RECORDING_TYPE_MISMATCH");
    if (!req.body.participantAId)
        throw new HttpError(422, "Participant A is required.", "PARTICIPANT_A_REQUIRED");
    const participant = await User.findById(req.body.participantAId).orFail();
    const ownsParticipant = String(participant.vendorId) === String(vendorId) || String(participant.createdById) === String(req.user.id);
    if (req.user.role === "VENDOR" && (participant.role !== "RECORDER" || !ownsParticipant)) throw new HttpError(403, "Select a recorder under your vendor account.", "FORBIDDEN");
    const assignment = {
        ...req.body,
        projectId,
        scriptId,
        vendorId: req.user.role === "VENDOR" ? toObjectId(vendorId) : toObjectId(req.body.vendorId),
        participantAId: toObjectId(req.body.participantAId),
        participantBId: null,
        status: "ASSIGNED"
    };
    const task = unassigned
        ? await RecordingTask.findOneAndUpdate({ _id: unassigned.id, status: "UNASSIGNED" }, assignment, { new: true })
        : await RecordingTask.create({ ...assignment, taskCode: `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}` });
    if (!task) throw new HttpError(409, "This script was already assigned by another vendor.", "TASK_ALREADY_CLAIMED");
    await audit(req.user?.id, "TASK_ASSIGNED", "RecordingTask", task.id);
    res.status(201).json(task);
});
platformRoutes.post("/tasks/bulk", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), validate(z.object({
    body: z.object({
        projectId: z.string().min(12),
        recordingType: z.enum(["SINGLE", "DUAL"]),
        vendorId: z.string().optional(),
        participantAId: z.string().min(12),
        participantBId: z.string().min(12).optional()
    })
})), async (req, res, next) => {
    try {
        const projectId = toObjectId(req.body.projectId);
        const project = await Project.findById(projectId).orFail();
        if (req.user.role === "VENDOR" && String(project.vendorId) !== String(req.user.vendorId)) throw new HttpError(403, "This project is not assigned to your vendor account.", "FORBIDDEN");
        const participant = await User.findById(req.body.participantAId).orFail();
        if (req.user.role === "VENDOR" && (participant.role !== "RECORDER" || String(participant.vendorId) !== String(req.user.vendorId))) throw new HttpError(403, "Select a recorder under your vendor account.", "FORBIDDEN");
        if (project.recordingType !== req.body.recordingType)
            throw new HttpError(422, "Project and task recording types must match.", "RECORDING_TYPE_MISMATCH");
        const scripts = await Script.find({ projectId, recordingType: req.body.recordingType, status: "ACTIVE", deletedAt: { $exists: false } }).select("_id");
        const participantAId = toObjectId(req.body.participantAId);
        let assigned = 0;
        for (const script of scripts) {
            const existing = await RecordingTask.findOne({ scriptId: script.id, deletedAt: { $exists: false } }).sort({ createdAt: -1 });
            if (existing && !["UNASSIGNED", "ASSIGNED"].includes(existing.status))
                continue;
            const values = { projectId, scriptId: script.id, recordingType: req.body.recordingType, vendorId: req.user.role === "VENDOR" ? toObjectId(req.user.vendorId) : toObjectId(req.body.vendorId), participantAId, participantBId: null, status: "ASSIGNED" };
            if (existing)
                await RecordingTask.findByIdAndUpdate(existing.id, values);
            else
                await RecordingTask.create({ ...values, taskCode: `TASK-${crypto.randomUUID().slice(0, 8).toUpperCase()}` });
            assigned += 1;
        }
        await audit(req.user?.id, "TASKS_BULK_ASSIGNED", "RecordingTask", undefined, { projectId: String(projectId), assigned });
        res.status(201).json({ created: assigned, skipped: scripts.length - assigned });
    }
    catch (error) {
        next(error);
    }
});
platformRoutes.patch("/tasks/assign-selection", allowRoles("SUPER_ADMIN", "ADMIN"), validate(z.object({
    body: z.object({
        taskIds: z.array(z.string().min(12)).min(1).max(100),
        vendorId: z.string().min(12).optional(),
        participantAId: z.string().min(12),
        participantBId: z.string().min(12).optional()
    })
})), async (req, res) => {
    const tasks = await RecordingTask.find({ _id: { $in: req.body.taskIds.map(toObjectId) }, deletedAt: { $exists: false } });
    const eligible = tasks.filter((task) => ["UNASSIGNED", "ASSIGNED"].includes(task.status));
    if (!eligible.length)
        throw new HttpError(422, "Selected tasks cannot be reassigned in their current status.", "TASKS_NOT_ASSIGNABLE");
    await Promise.all(eligible.map((task) => RecordingTask.findByIdAndUpdate(task.id, {
        vendorId: toObjectId(req.body.vendorId),
        participantAId: toObjectId(req.body.participantAId),
        participantBId: null,
        status: "ASSIGNED"
    })));
    await audit(req.user?.id, "TASKS_SELECTION_ASSIGNED", "RecordingTask", undefined, { taskIds: eligible.map((task) => task.id) });
    res.json({ assigned: eligible.length, skipped: tasks.length - eligible.length });
});
platformRoutes.patch("/tasks/:id", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    const current = await RecordingTask.findOne({ _id: req.params.id, deletedAt: { $exists: false } }).orFail();
    const vendorCanClaim = current.status === "UNASSIGNED";
    if (req.user.role === "VENDOR" && String(current.vendorId) !== String(req.user.vendorId) && !vendorCanClaim) throw new HttpError(403, "This task is not available to your vendor account.", "FORBIDDEN");
    const participant = req.body.participantAId ? await User.findById(req.body.participantAId).orFail() : null;
    if (req.user.role === "VENDOR" && participant && (participant.role !== "RECORDER" || String(participant.vendorId) !== String(req.user.vendorId))) throw new HttpError(403, "Select a recorder under your vendor account.", "FORBIDDEN");
    if (!["UNASSIGNED", "ASSIGNED"].includes(current.status))
        throw new HttpError(422, "Only unassigned or assigned tasks can be edited.", "TASK_NOT_EDITABLE");
    const updates = {
        vendorId: req.user.role === "VENDOR" ? toObjectId(req.user.vendorId) : toObjectId(req.body.vendorId),
        participantAId: toObjectId(req.body.participantAId),
        participantBId: null,
        status: req.body.participantAId ? "ASSIGNED" : "UNASSIGNED"
    };
    const updateWhere = req.user.role === "VENDOR"
        ? { _id: current.id, $or: [{ vendorId: toObjectId(req.user.vendorId) }, { status: "UNASSIGNED" }] }
        : { _id: current.id };
    const task = await RecordingTask.findOneAndUpdate(updateWhere, updates, { new: true })
        .populate("projectId")
        .populate("scriptId")
        .populate("vendorId")
        .populate("participantAId", publicUser)
        .populate("participantBId", publicUser);
    if (!task) throw new HttpError(409, "This task was already assigned by another vendor.", "TASK_ALREADY_CLAIMED");
    await audit(req.user?.id, "TASK_UPDATED", "RecordingTask", task.id);
    res.json(await taskPayload(task));
});
platformRoutes.delete("/tasks/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const current = await RecordingTask.findOne({ _id: req.params.id, deletedAt: { $exists: false } }).orFail();
    if (!["UNASSIGNED", "ASSIGNED"].includes(current.status))
        throw new HttpError(422, "Only unassigned or assigned tasks can be deleted.", "TASK_NOT_DELETABLE");
    const task = await RecordingTask.findByIdAndDelete(current.id).orFail();
    await audit(req.user?.id, "TASK_DELETED", "RecordingTask", task.id, { permanent: true });
    res.json({ deleted: true, id: task.id });
});
platformRoutes.post("/tasks/:id/assign", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    const current = await RecordingTask.findOne({ _id: req.params.id, deletedAt: { $exists: false } }).orFail();
    const currentStatus = current.status;
    const nextStatus = currentStatus === "UNASSIGNED" ? "ASSIGNED" : currentStatus;
    if (nextStatus !== currentStatus)
        assertTaskTransition(currentStatus, nextStatus);
    const task = await RecordingTask.findByIdAndUpdate(current.id, { ...req.body, status: nextStatus }, { new: true }).orFail();
    await audit(req.user?.id, "TASK_ASSIGNED", "RecordingTask", task.id);
    res.json(task);
});
platformRoutes.post("/invitations", allowRoles("SUPER_ADMIN", "ADMIN", "VENDOR"), async (req, res) => {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invitation = await Invitation.create({ ...req.body, tokenHash, projectId: toObjectId(req.body.projectId), taskId: toObjectId(req.body.taskId), expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) });
    await audit(req.user?.id, "INVITATION_SENT", "Invitation", invitation.id, { email: invitation.email });
    res.status(201).json({ ...json(invitation), inviteUrl: `${process.env.APP_URL ?? "http://localhost:5173"}/invite/dual/${token}` });
});
platformRoutes.post("/invitations/:token/accept", async (req, res) => {
    const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
    const invitation = await Invitation.findOne({ tokenHash });
    if (!invitation || invitation.status !== "PENDING" || (invitation.expiresAt && invitation.expiresAt < new Date())) {
        throw new HttpError(410, "This invitation is expired or no longer valid.", "INVITATION_INVALID");
    }
    let session;
    if (invitation.taskId) {
        const task = await RecordingTask.findById(invitation.taskId).orFail();
        if (req.user?.platformType !== "DUAL_RECORDING")
            throw new HttpError(403, "A Dual Recording account is required to join this invitation.", "FORBIDDEN");
        if (String(task.participantAId) === String(req.user?.id))
            throw new HttpError(422, "Participant A cannot join their own invitation as Participant B.", "INVALID_PARTICIPANT");
        if (task.participantBId && String(task.participantBId) !== String(req.user?.id))
            throw new HttpError(403, "This task already has Participant B.", "PARTICIPANT_B_ASSIGNED");
        session = await RecordingSession.findOne({ taskId: invitation.taskId }).sort({ createdAt: -1 });
        task.participantBId = toObjectId(req.user.id);
        await task.save();
        if (session) {
            session.participantBId = toObjectId(req.user.id);
            const participantB = session.participants.find((participant) => participant.label === "B");
            if (participantB)
                participantB.userId = toObjectId(req.user.id);
            await session.save();
        }
    }
    else {
        if (req.user?.platformType !== "DUAL_RECORDING")
            throw new HttpError(403, "A Dual Recording account is required to join this invitation.", "FORBIDDEN");
        session = await RecordingSession.findById(invitation.sessionId).orFail();
        if (String(session.participantAId) === String(req.user?.id))
            throw new HttpError(422, "Participant A cannot join their own invitation as Participant B.", "INVALID_PARTICIPANT");
        session.participantBId = toObjectId(req.user.id);
        const participantB = session.participants.find((participant) => participant.label === "B");
        if (participantB)
            participantB.userId = toObjectId(req.user.id);
        await session.save();
    }
    invitation.status = "ACCEPTED";
    invitation.acceptedAt = new Date();
    await invitation.save();
    await audit(req.user?.id, "INVITATION_ACCEPTED", "Invitation", invitation.id);
    res.json({ ...json(invitation), sessionId: session?.id, taskId: invitation.taskId ? String(invitation.taskId) : null, participantRole: "B" });
});
platformRoutes.post("/dual-invitations", async (req, res) => {
    if (req.user?.role !== "RECORDER" || req.user?.platformType !== "DUAL_RECORDING")
        throw new HttpError(403, "Only a Dual Recording user can create this invitation.", "FORBIDDEN");
    const session = await RecordingSession.create({
        sessionCode: `SES-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        participantAId: toObjectId(req.user.id),
        recordingType: "DUAL",
        status: "WAITING_FOR_PARTICIPANTS",
        participants: [{ label: "A", userId: toObjectId(req.user.id) }, { label: "B" }]
    });
    const token = crypto.randomBytes(32).toString("hex");
    const invitation = await Invitation.create({
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        sessionId: session.id,
        invitedById: toObjectId(req.user.id),
        participantRole: "B",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    });
    await audit(req.user.id, "STANDALONE_DUAL_INVITATION_CREATED", "Invitation", invitation.id, { sessionId: session.id });
    res.status(201).json({ sessionId: session.id, inviteUrl: `${process.env.APP_URL ?? "http://localhost:5173"}/invite/dual/${token}`, expiresAt: invitation.expiresAt });
});
platformRoutes.post("/recording-sessions", async (req, res) => {
    const task = await RecordingTask.findById(req.body.taskId).orFail();
    if (task.recordingType !== "DUAL")
        throw new HttpError(422, "A dual recording task is required.", "DUAL_TASK_REQUIRED");
    if (String(task.participantAId) !== String(req.user?.id) && !["ADMIN", "SUPER_ADMIN"].includes(req.user?.role))
        throw new HttpError(403, "Only Participant A can create the dual session.", "FORBIDDEN");
    const existing = await RecordingSession.findOne({ taskId: task.id, status: { $nin: ["COMPLETED"] } }).sort({ createdAt: -1 });
    if (existing)
        return res.json({ ...json(existing), participantRole: sessionRole(existing, req.user) });
    const participants = task.recordingType === "DUAL" ? [{ label: "A", userId: task.participantAId }, { label: "B", userId: task.participantBId }] : [{ label: "A", userId: task.participantAId }];
    const session = await RecordingSession.create({
        sessionCode: `SES-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        projectId: task.projectId,
        taskId: task.id,
        scriptId: task.scriptId,
        participantAId: task.participantAId,
        participantBId: task.participantBId,
        recordingType: task.recordingType,
        status: task.recordingType === "DUAL" ? "WAITING_FOR_PARTICIPANTS" : "READY",
        participants
    });
    await audit(req.user?.id, "RECORDING_SESSION_CREATED", "RecordingSession", session.id);
    res.status(201).json({ ...json(session), participantRole: "A" });
});
platformRoutes.get("/recording-sessions/task/:taskId", async (req, res) => {
    const task = await RecordingTask.findById(req.params.taskId).orFail();
    const session = await RecordingSession.findOne({ taskId: task.id }).sort({ createdAt: -1 });
    const role = session ? sessionRole(session, req.user) : String(task.participantAId) === String(req.user?.id) ? "A" : String(task.participantBId) === String(req.user?.id) ? "B" : null;
    if (!role && !["ADMIN", "SUPER_ADMIN"].includes(req.user?.role))
        throw new HttpError(403, "This task is not assigned to you.", "FORBIDDEN");
    res.json({ session: session ? json(session) : null, participantRole: role, task: await taskPayload(await task.populate("projectId scriptId participantAId participantBId")) });
});
platformRoutes.post("/recording-sessions/:id/invite", async (req, res) => {
    const session = await RecordingSession.findById(req.params.id).orFail();
    requireSessionParticipant(session, req.user, "A");
    const participantB = session.participantBId ? await User.findById(session.participantBId) : null;
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invitation = await Invitation.create({ tokenHash, projectId: session.projectId, taskId: session.taskId, sessionId: session.id, email: participantB?.email, participantRole: "B", expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24) });
    await audit(req.user?.id, "PARTICIPANT_B_INVITED", "Invitation", invitation.id, { sessionId: session.id, email: participantB?.email });
    res.status(201).json({ sessionId: session.id, inviteUrl: `${process.env.APP_URL ?? "http://localhost:5173"}/invite/dual/${token}`, email: participantB?.email, expiresAt: invitation.expiresAt });
});
platformRoutes.get("/recording-sessions/live", allowRoles("SUPER_ADMIN", "ADMIN", "QA", "VENDOR"), async (req, res) => {
    if (req.user.role === "VENDOR" && !req.user.vendorId) return res.json([]);
    const vendorUserIds = req.user.role === "VENDOR"
        ? (await User.find({ vendorId: toObjectId(req.user.vendorId), role: "RECORDER", deletedAt: { $exists: false } }).select("_id")).map((user) => user._id)
        : null;
    const where = {
        status: "RECORDING",
        ...(typeof req.query.recordingType === "string" ? { recordingType: req.query.recordingType } : {}),
        ...(vendorUserIds ? { $or: [{ participantAId: { $in: vendorUserIds } }, { participantBId: { $in: vendorUserIds } }] } : {})
    };
    const sessions = await RecordingSession.find(where)
        .populate("projectId", "name code")
        .populate("taskId", "taskCode")
        .populate("scriptId", "title scriptCode")
        .populate("participantAId", publicUser)
        .populate("participantBId", publicUser)
        .sort({ startedAt: -1 });
    res.json(sessions);
});
platformRoutes.get("/recording-sessions/:id", async (req, res, next) => {
    try {
        const session = await RecordingSession.findById(req.params.id).populate({
            path: "taskId",
            populate: [
                { path: "projectId" },
                { path: "scriptId" },
                { path: "vendorId" },
                { path: "participantAId", select: publicUser },
                { path: "participantBId", select: publicUser }
            ]
        }).orFail();
        const participantRole = sessionRole(session, req.user);
        if (!participantRole && !["ADMIN", "SUPER_ADMIN", "QA"].includes(req.user?.role))
            throw new HttpError(403, "This session is not assigned to you.", "FORBIDDEN");
        const row = json(session);
        row.task = session.taskId ? await taskPayload(session.taskId) : undefined;
        row.tracks = await RecordingTrack.find({ sessionId: session.id }).populate("mediaFileId");
        row.participantRole = participantRole;
        res.json(row);
    } catch (error) {
        next(error);
    }
});
platformRoutes.post("/recording-sessions/:id/join", async (req, res) => {
    const session = await RecordingSession.findById(req.params.id).orFail();
    const label = requireSessionParticipant(session, req.user);
    if (label === "B") {
        const acceptedInvite = await Invitation.exists({ taskId: session.taskId, participantRole: "B", status: "ACCEPTED" });
        if (!acceptedInvite)
            throw new HttpError(403, "Participant B must accept Participant A's invitation before joining.", "INVITATION_REQUIRED");
    }
    const participant = session.participants.find((p) => p.label === label);
    if (!participant)
        throw new HttpError(404, "Participant not found.", "PARTICIPANT_NOT_FOUND");
    participant.connection = "CONNECTED";
    participant.joinedAt = new Date();
    participant.deviceMeta = req.body.deviceMeta ?? {};
    await session.save();
    res.json(participant);
});
platformRoutes.post("/recording-sessions/:id/ready", async (req, res) => {
    const session = await RecordingSession.findById(req.params.id).orFail();
    const label = requireSessionParticipant(session, req.user);
    const participant = session.participants.find((p) => p.label === label);
    if (!participant)
        throw new HttpError(404, "Participant not found.", "PARTICIPANT_NOT_FOUND");
    participant.connection = "CONNECTED";
    participant.micReady = true;
    participant.cameraReady = Boolean(req.body.cameraReady ?? true);
    participant.networkOk = true;
    participant.ready = true;
    participant.deviceMeta = req.body.deviceMeta ?? {};
    if (session.participants.every((p) => p.ready) && session.status === "WAITING_FOR_PARTICIPANTS") {
        assertSessionTransition(session.status, "READY");
        session.status = "READY";
    }
    await session.save();
    res.json(participant);
});
platformRoutes.post("/recording-sessions/:id/start", async (req, res, next) => {
    try {
        const session = await RecordingSession.findById(req.params.id).orFail();
        requireSessionParticipant(session, req.user, "A");
        if (!session.participants.every((p) => p.ready))
            throw new HttpError(409, "Both participants must be ready before recording can start.", "PARTICIPANTS_NOT_READY");
        if (!["READY", "WAITING_FOR_PARTICIPANTS"].includes(session.status))
            throw new HttpError(409, "Use Re-record before starting this session again.", "RERECORD_REQUIRED");
        if (session.status === "WAITING_FOR_PARTICIPANTS") session.status = "READY";
        assertSessionTransition(session.status, "RECORDING");
        session.status = "RECORDING";
        session.startedAt = new Date();
        session.syncMetadata = { serverStartEpochMs: Date.now(), countdownSeconds: 5 };
        await session.save();
        req.app.get("io")?.to(`session:${session.id}`).emit("session:recording-state", { state: "RECORDING", serverStartEpochMs: session.syncMetadata.serverStartEpochMs });
        if (session.taskId) await RecordingTask.findByIdAndUpdate(session.taskId, { status: "RECORDING" });
        await audit(req.user?.id, "RECORDING_STARTED", "RecordingSession", session.id);
        res.json(session);
    }
    catch (error) { next(error); }
});
platformRoutes.post("/recording-sessions/:id/stop", async (req, res, next) => {
    try {
        const session = await RecordingSession.findById(req.params.id).orFail();
        requireSessionParticipant(session, req.user, "A");
        if (session.status !== "RECORDING")
            throw new HttpError(409, "This session is not currently recording.", "SESSION_NOT_RECORDING");
        assertSessionTransition(session.status, "PROCESSING");
        const endedAt = new Date();
        session.status = "PROCESSING";
        session.endedAt = endedAt;
        session.durationSeconds = session.startedAt ? Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000) : undefined;
        await session.save();
        req.app.get("io")?.to(`session:${session.id}`).emit("session:recording-state", { state: "PROCESSING" });
        res.json(session);
    }
    catch (error) { next(error); }
});
platformRoutes.post("/recording-sessions/:id/control", async (req, res, next) => {
    try {
        const session = await RecordingSession.findById(req.params.id).orFail();
        requireSessionParticipant(session, req.user, "A");
        const action = req.body.action;
        if (!["PAUSE", "RESUME", "RERECORD", "SUBMIT"].includes(action))
            throw new HttpError(422, "Unsupported session control.", "INVALID_CONTROL");
        session.syncMetadata = { ...(session.syncMetadata ?? {}), controlState: action, controlledAt: new Date().toISOString() };
        if (action === "RERECORD") {
            session.status = "READY";
            session.startedAt = undefined;
            session.endedAt = undefined;
        }
        if (action === "SUBMIT") session.qaStatus = "PENDING_UPLOAD";
        await session.save();
        const broadcastState = action === "RESUME" ? "RECORDING" : action === "RERECORD" ? "READY" : action;
        req.app.get("io")?.to(`session:${session.id}`).emit("session:recording-state", { state: broadcastState });
        await audit(req.user?.id, `DUAL_SESSION_${action}`, "RecordingSession", session.id);
        res.json(session);
    }
    catch (error) { next(error); }
});
platformRoutes.post("/recording-sessions/:id/next", async (req, res) => {
    const currentSession = await RecordingSession.findById(req.params.id).orFail();
    requireSessionParticipant(currentSession, req.user, "A");
    const currentTask = await RecordingTask.findById(currentSession.taskId).orFail();
    const completedScriptIds = await RecordingTask.distinct("scriptId", {
        participantAId: currentTask.participantAId,
        status: { $in: ["UPLOADED", "QA_PENDING", "APPROVED", "COMPLETED"] }
    });
    const excludedScriptIds = [...new Set([...completedScriptIds.map(String), String(currentTask.scriptId)])].map(toObjectId);
    const taskFilter = {
        _id: { $ne: currentTask.id },
        deletedAt: { $exists: false },
        recordingType: "DUAL",
        participantAId: currentTask.participantAId,
        scriptId: { $nin: excludedScriptIds },
        status: { $in: ["ASSIGNED", "INVITED", "READY"] }
    };
    const nextTask = await RecordingTask.findOne({ ...taskFilter, createdAt: { $gt: currentTask.createdAt } }).sort({ createdAt: 1 })
        ?? await RecordingTask.findOne(taskFilter).sort({ createdAt: 1 });
    if (!nextTask)
        throw new HttpError(404, "No next assigned dual script is available.", "NEXT_SCRIPT_NOT_FOUND");

    let nextSession = await RecordingSession.findOne({
        taskId: nextTask.id,
        participantAId: nextTask.participantAId,
        participantBId: nextTask.participantBId ?? null,
        status: { $nin: ["COMPLETED"] }
    }).sort({ createdAt: -1 });
    if (!nextSession) {
        nextSession = await RecordingSession.create({
            sessionCode: `SES-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            projectId: nextTask.projectId,
            taskId: nextTask.id,
            scriptId: nextTask.scriptId,
            participantAId: nextTask.participantAId,
            participantBId: nextTask.participantBId,
            recordingType: "DUAL",
            status: "READY",
            participants: [
                { label: "A", userId: nextTask.participantAId, micReady: true, cameraReady: true, networkOk: true, ready: true },
                { label: "B", userId: nextTask.participantBId, micReady: true, cameraReady: true, networkOk: true, ready: true }
            ],
            syncMetadata: { previousSessionId: currentSession.id }
        });
    }
    else if (["WAITING_FOR_PARTICIPANTS", "READY"].includes(nextSession.status)) {
        nextSession.status = "READY";
        nextSession.syncMetadata = { ...(nextSession.syncMetadata ?? {}), previousSessionId: currentSession.id };
        nextSession.participants.forEach((participant) => {
            participant.micReady = true;
            participant.cameraReady = true;
            participant.networkOk = true;
            participant.ready = true;
        });
        await nextSession.save();
    }
    const inviteToken = crypto.randomBytes(32).toString("hex");
    await Invitation.create({
        tokenHash: crypto.createHash("sha256").update(inviteToken).digest("hex"),
        projectId: nextTask.projectId,
        taskId: nextTask.id,
        sessionId: nextSession.id,
        invitedById: req.user.id,
        participantRole: "B",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
    });
    req.app.get("io")?.to(`session:${currentSession.id}`).emit("session:next-script", { sessionId: nextSession.id, inviteToken });
    await audit(req.user?.id, "DUAL_SESSION_NEXT_SCRIPT", "RecordingSession", nextSession.id, { previousSessionId: currentSession.id });
    res.json({ sessionId: nextSession.id, taskId: nextTask.id });
});
platformRoutes.post("/uploads/initiate", async (req, res) => {
    const settings = await AppSetting.findOneAndUpdate({ key: "global" }, { $setOnInsert: { key: "global" } }, { new: true, upsert: true });
    const initiated = await storageProvider({ enabled: settings.r2Enabled, bucket: settings.r2Bucket, singlePrefix: settings.r2SinglePrefix, dualPrefix: settings.r2DualPrefix }).initiateUpload(req.body);
    const media = await MediaFile.create({ fileKey: initiated.fileKey, bucket: initiated.bucket, mimeType: req.body.mimeType, size: req.body.size, checksum: req.body.checksum, storageProvider: initiated.provider, uploadStatus: "INITIATED" });
    res.status(201).json({ uploadId: media.id, ...initiated });
});
const localUploads = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../uploads");
platformRoutes.put("/uploads/local/:fileKey", express.raw({ type: "*/*", limit: "500mb" }), async (req, res) => {
    const media = await MediaFile.findOne({ fileKey: req.params.fileKey, storageProvider: "local" }).orFail();
    await fs.mkdir(localUploads, { recursive: true });
    await fs.writeFile(path.join(localUploads, path.basename(media.fileKey)), req.body);
    res.json({ ok: true });
});
platformRoutes.get("/uploads/local/:fileKey", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const media = await MediaFile.findOne({ fileKey: req.params.fileKey, uploadStatus: "COMPLETED" });
    if (!media) throw new HttpError(404, "Audio file not found.", "MEDIA_NOT_FOUND");
    const filePath = path.join(localUploads, path.basename(media.fileKey));
    try {
        await fs.access(filePath);
    } catch {
        throw new HttpError(404, "Audio file is no longer available.", "MEDIA_FILE_MISSING");
    }
    res.type(media.mimeType).sendFile(filePath);
});
platformRoutes.post("/uploads/:id/complete", async (req, res) => {
    if (req.body.manual === true && req.user.recordingMode !== "NON_SCRIPTED")
        throw new HttpError(403, "This account is not enabled for non-script recording.", "FORBIDDEN");
    const media = await MediaFile.findByIdAndUpdate(req.params.id, { uploadStatus: "COMPLETED", durationSeconds: req.body.durationSeconds }, { new: true }).orFail();
    let recordingId = req.body.recordingId;
    let manualRecordingId;
    if (req.body.manual === true) {
        const manualRecording = await ManualRecording.create({ userId: req.user.id, mediaFileId: media.id, duration: req.body.durationSeconds, kind: req.body.kind ?? "audio" });
        manualRecordingId = manualRecording.id;
    }
    if (!recordingId && req.body.taskId) {
        const task = await RecordingTask.findById(req.body.taskId).orFail();
        const sessionId = toObjectId(req.body.sessionId);
        const session = await RecordingSession.findById(sessionId).orFail();
        let recording = session.syncMetadata?.recordingId
            ? await Recording.findById(session.syncMetadata.recordingId)
            : await Recording.findOne({ sessionId }).sort({ createdAt: 1 });

        if (recording) {
            await RecordingSession.findOneAndUpdate(
                { _id: sessionId, $or: [{ "syncMetadata.recordingId": { $exists: false } }, { "syncMetadata.recordingId": null }] },
                { $set: { "syncMetadata.recordingId": recording.id } }
            );
            const refreshedSession = await RecordingSession.findById(sessionId).orFail();
            recordingId = refreshedSession.syncMetadata?.recordingId ?? recording.id;
        } else {
            const candidate = await Recording.create({ recordingCode: `REC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, projectId: task.projectId, taskId: task.id, sessionId, userId: task.participantAId, vendorId: task.vendorId, recordingType: task.recordingType, duration: req.body.durationSeconds, qaStatus: "QA_PENDING", uploadedAt: new Date() });
            const claimedSession = await RecordingSession.findOneAndUpdate(
                { _id: sessionId, $or: [{ "syncMetadata.recordingId": { $exists: false } }, { "syncMetadata.recordingId": null }] },
                { $set: { "syncMetadata.recordingId": candidate.id } },
                { new: true }
            );
            const claimedId = claimedSession?.syncMetadata?.recordingId
                ?? (await RecordingSession.findById(sessionId).orFail()).syncMetadata?.recordingId;
            if (String(claimedId) === candidate.id) {
                recordingId = candidate.id;
            } else {
                await Recording.findByIdAndDelete(candidate.id);
                const refreshedSession = await RecordingSession.findById(sessionId).orFail();
                recordingId = refreshedSession.syncMetadata?.recordingId;
                if (!recordingId) throw new HttpError(409, "Unable to attach the uploaded track. Please retry.", "RECORDING_RACE_CONDITION");
            }
        }
        await RecordingTask.findByIdAndUpdate(task.id, { status: "QA_PENDING" });
    }
    if (req.body.sessionId) {
        await RecordingTrack.create({ recordingId: toObjectId(recordingId), sessionId: toObjectId(req.body.sessionId), participantLabel: req.body.participantLabel ?? "A", kind: req.body.kind ?? "audio", mediaFileId: media.id, timestamps: req.body.timestamps ?? {}, deviceMetadata: req.body.deviceMetadata ?? {} });
    }
    await audit(req.user?.id, "RECORDING_UPLOADED", "MediaFile", media.id);
    res.json({ ...json(media), recordingId, manualRecordingId });
});
platformRoutes.get("/recordings", async (req, res) => {
    const { skip, limit } = pageArgs(req.query);
    const recordings = await Recording.find().populate("projectId").populate("taskId").sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(await Promise.all(recordings.map(recordingPayload)));
});
platformRoutes.get("/recordings-dual", allowRoles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
    const req = _req;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 100)));
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let searchFilters = [];
    if (search) {
        const regex = { $regex: escapedSearch, $options: "i" };
        const [scripts, projects] = await Promise.all([
            Script.find({ $or: [{ title: regex }, { scriptCode: regex }] }).select("_id"),
            Project.find({ $or: [{ name: regex }, { code: regex }] }).select("_id")
        ]);
        const tasks = await RecordingTask.find({
            $or: [
                { taskCode: regex },
                { scriptId: { $in: scripts.map((script) => script.id) } },
                { projectId: { $in: projects.map((project) => project.id) } }
            ]
        }).select("_id");
        searchFilters = [
            { recordingCode: regex },
            { taskId: { $in: tasks.map((task) => task.id) } },
            { projectId: { $in: projects.map((project) => project.id) } }
        ];
    }
    const where = { recordingType: "DUAL", ...(searchFilters.length ? { $or: searchFilters } : {}) };
    const recordings = await Recording.find(where).populate("projectId").populate({ path: "taskId", populate: { path: "scriptId" } }).sort({ createdAt: -1 });
    const rows = await Promise.all(recordings.map(async (recording) => {
        const row = await recordingPayload(recording);
        const availableTracks = await Promise.all(row.tracks.map(async (track) => {
            if (!track.mediaFileId) return null;
            const isLocal = track.mediaFileId.storageProvider === "local" || track.mediaFileId.fileKey.startsWith("local/");
            if (isLocal) {
                try {
                    await fs.access(path.join(localUploads, path.basename(track.mediaFileId.fileKey)));
                } catch {
                    return null;
                }
            }
            return { ...json(track), playbackUrl: await storageProvider().getSignedPlaybackUrl(track.mediaFileId.fileKey, track.mediaFileId.bucket) };
        }));
        row.tracks = availableTracks.filter(Boolean);
        return row;
    }));
    const groupedRows = [];
    const rowsBySession = new Map();
    for (const row of rows) {
        const key = String(row.sessionId ?? row.id);
        const existing = rowsBySession.get(key);
        if (!existing) {
            row.recordingIds = [row.id];
            rowsBySession.set(key, row);
            groupedRows.push(row);
            continue;
        }
        existing.recordingIds.push(row.id);
        existing.tracks = [...existing.tracks, ...row.tracks].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
    }
    const total = groupedRows.length;
    const safePage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const items = groupedRows.slice((safePage - 1) * pageSize, safePage * pageSize);
    res.json({ items, total, page: safePage, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});
async function deleteRecordingMedia(recordingIds) {
    const tracks = await RecordingTrack.find({ recordingId: { $in: recordingIds } }).populate("mediaFileId");
    const mediaFiles = [...new Map(tracks.filter((track) => track.mediaFileId).map((track) => [track.mediaFileId.id, track.mediaFileId])).values()];
    const provider = storageProvider({ enabled: true });
    await Promise.all(mediaFiles.map(async (media) => {
        const isLocal = media.storageProvider === "local" || media.fileKey.startsWith("local/");
        if (isLocal) {
            try { await fs.unlink(path.join(localUploads, path.basename(media.fileKey))); }
            catch (error) { if (error?.code !== "ENOENT") throw error; }
            return;
        }
        if (typeof provider.deleteObject !== "function") throw new HttpError(501, "Cloud storage deletion is not configured.", "STORAGE_DELETE_UNAVAILABLE");
        await provider.deleteObject(media.fileKey, media.bucket || undefined);
    }));
    await RecordingTrack.deleteMany({ recordingId: { $in: recordingIds } });
    await MediaFile.deleteMany({ _id: { $in: mediaFiles.map((media) => media._id) } });
    await Recording.deleteMany({ _id: { $in: recordingIds } });
    return mediaFiles.length;
}
async function deleteDualRecordingGroups(ids) {
    const selected = await Recording.find({ _id: { $in: ids }, recordingType: "DUAL" }).select("_id sessionId");
    if (!selected.length) throw new HttpError(404, "Recording not found.", "RECORDING_NOT_FOUND");
    const sessionIds = selected.map((recording) => recording.sessionId).filter(Boolean);
    const recordings = await Recording.find({
        recordingType: "DUAL",
        $or: [{ _id: { $in: ids } }, ...(sessionIds.length ? [{ sessionId: { $in: sessionIds } }] : [])]
    }).select("_id sessionId");
    const recordingIds = recordings.map((recording) => recording._id);
    await deleteRecordingMedia(recordingIds);

    if (sessionIds.length) {
        await RecordingSession.updateMany({ _id: { $in: sessionIds } }, { $unset: { "syncMetadata.recordingId": 1 } });
    }
    return recordingIds.length;
}
platformRoutes.delete("/recordings-dual/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const deleted = await deleteDualRecordingGroups([toObjectId(req.params.id)]);
    await audit(req.user?.id, "DUAL_RECORDING_DELETED", "Recording", req.params.id, { deleted });
    res.json({ deleted });
});
platformRoutes.delete("/recordings-dual", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const ids = z.array(z.string()).min(1).max(100).parse(req.body.ids).map(toObjectId);
    const deleted = await deleteDualRecordingGroups(ids);
    await audit(req.user?.id, "DUAL_RECORDINGS_BULK_DELETED", "Recording", undefined, { deleted });
    res.json({ deleted });
});
platformRoutes.get("/recordings/:id", async (req, res) => {
    const recording = await Recording.findById(req.params.id).populate("projectId").populate({ path: "taskId", populate: { path: "scriptId" } }).populate("sessionId").orFail();
    res.json(await recordingPayload(recording));
});
platformRoutes.post("/qa/reviews", allowRoles("SUPER_ADMIN", "ADMIN", "QA"), async (req, res) => {
    if ((req.body.decision === "REJECT" || req.body.decision === "RE_RECORD") && !req.body.rejectionReason) {
        throw new HttpError(422, "Rejection reason is required when rejecting or requesting re-record.", "REJECTION_REASON_REQUIRED");
    }
    const review = await QaReview.create({ ...req.body, reviewerId: req.user.id, history: [{ decision: req.body.decision, at: new Date().toISOString(), reviewerId: req.user.id }] });
    const qaStatus = req.body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const recording = await Recording.findByIdAndUpdate(req.body.recordingId, { qaStatus }, { new: true }).orFail();
    await RecordingTask.findByIdAndUpdate(recording.taskId, { status: qaStatus === "APPROVED" ? "APPROVED" : "REJECTED" });
    await audit(req.user?.id, `RECORDING_${qaStatus}`, "Recording", recording.id);
    res.status(201).json(review);
});
platformRoutes.get("/qa/queue", async (req, res) => {
    const { skip, limit } = pageArgs(req.query);
    const recordings = await Recording.find({ qaStatus: "QA_PENDING" }).populate("projectId").populate({ path: "taskId", populate: [{ path: "scriptId" }, { path: "vendorId" }] }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(await Promise.all(recordings.map(recordingPayload)));
});
platformRoutes.get("/reports/projects", async (_req, res) => {
    const projects = await Project.find(_req.user.role === "VENDOR" ? { vendorId: toObjectId(_req.user.vendorId) } : {}).populate("clientId").populate("vendorId").sort({ createdAt: -1 });
    res.json(await Promise.all(projects.map(projectPayload)));
});
platformRoutes.get("/reports/vendors", async (_req, res) => {
    const vendors = await Vendor.find(_req.user.role === "VENDOR" ? { _id: toObjectId(_req.user.vendorId) } : {}).sort({ companyName: 1 });
    res.json(await Promise.all(vendors.map(async (vendor) => ({ ...json(vendor), _count: { tasks: await RecordingTask.countDocuments({ vendorId: vendor.id }), users: await User.countDocuments({ vendorId: vendor.id }), projects: await Project.countDocuments({ vendorId: vendor.id }) } }))));
});
platformRoutes.get("/reports/users", async (_req, res) => {
    const users = await User.find(_req.user.role === "VENDOR" ? { vendorId: toObjectId(_req.user.vendorId), role: "RECORDER" } : {}).select(publicUser).sort({ createdAt: -1 });
    res.json(await Promise.all(users.map(async (user) => ({ ...json(user), _count: { tasksA: await RecordingTask.countDocuments({ participantAId: user.id }), tasksB: await RecordingTask.countDocuments({ participantBId: user.id }), qaReviews: await QaReview.countDocuments({ reviewerId: user.id }) } }))));
});
platformRoutes.get("/billing", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    res.json(await Invoice.find(status ? { status } : {}).sort({ createdAt: -1 }));
});
platformRoutes.post("/billing", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = z.object({ clientName: z.string().trim().min(2), amount: z.coerce.number().positive(), currency: z.string().trim().min(3).max(3).default("INR"), dueDate: z.string().optional(), status: z.enum(["DRAFT", "PENDING", "PAID", "OVERDUE", "CANCELLED"]).default("PENDING"), notes: z.string().trim().max(500).optional() }).parse(req.body);
    const invoice = await Invoice.create({ ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined, invoiceNumber: `INV-${Date.now().toString().slice(-8)}`, createdById: toObjectId(req.user.id) });
    await audit(req.user.id, "INVOICE_CREATED", "Invoice", invoice.id, { amount: invoice.amount });
    res.status(201).json(invoice);
});
platformRoutes.patch("/billing/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = z.object({ status: z.enum(["DRAFT", "PENDING", "PAID", "OVERDUE", "CANCELLED"]) }).parse(req.body);
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, input, { new: true }).orFail();
    await audit(req.user.id, "INVOICE_UPDATED", "Invoice", invoice.id, input);
    res.json(invoice);
});
platformRoutes.delete("/billing/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const invoice = await Invoice.findByIdAndDelete(req.params.id).orFail();
    await audit(req.user.id, "INVOICE_DELETED", "Invoice", invoice.id);
    res.json({ deleted: true });
});
platformRoutes.get("/vendor-payments", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    res.json(await VendorPayment.find().populate("vendorId", "companyName").sort({ createdAt: -1 }));
});
platformRoutes.post("/vendor-payments", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = z.object({ vendorId: z.string().min(12), amount: z.coerce.number().positive(), currency: z.string().trim().min(3).max(3).default("INR"), period: z.string().trim().max(50).optional(), reference: z.string().trim().max(100).optional(), status: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED"]).default("PENDING") }).parse(req.body);
    const payment = await VendorPayment.create({ ...input, vendorId: toObjectId(input.vendorId), paymentNumber: `PAY-${Date.now().toString().slice(-8)}`, paidAt: input.status === "PAID" ? new Date() : undefined, createdById: toObjectId(req.user.id) });
    await audit(req.user.id, "VENDOR_PAYMENT_CREATED", "VendorPayment", payment.id, { amount: payment.amount });
    res.status(201).json(payment);
});
platformRoutes.patch("/vendor-payments/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = z.object({ status: z.enum(["PENDING", "PROCESSING", "PAID", "FAILED"]) }).parse(req.body);
    const update = { ...input, ...(input.status === "PAID" ? { paidAt: new Date() } : {}) };
    const payment = await VendorPayment.findByIdAndUpdate(req.params.id, update, { new: true }).populate("vendorId", "companyName").orFail();
    await audit(req.user.id, "VENDOR_PAYMENT_UPDATED", "VendorPayment", payment.id, input);
    res.json(payment);
});
platformRoutes.delete("/vendor-payments/:id", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const payment = await VendorPayment.findByIdAndDelete(req.params.id).orFail();
    await audit(req.user.id, "VENDOR_PAYMENT_DELETED", "VendorPayment", payment.id);
    res.json({ deleted: true });
});
platformRoutes.get("/notifications", async (req, res) => {
    const where = ["SUPER_ADMIN", "ADMIN"].includes(req.user.role) ? {} : { $or: [{ userId: toObjectId(req.user.id) }, { userId: null }] };
    res.json(await Notification.find(where).populate("userId", "name email role").sort({ createdAt: -1 }).limit(200));
});
platformRoutes.post("/notifications", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = z.object({ userId: z.string().optional(), type: z.enum(["INFO", "SUCCESS", "WARNING", "ERROR"]).default("INFO"), title: z.string().trim().min(2).max(100), message: z.string().trim().min(2).max(500) }).parse(req.body);
    const notification = await Notification.create({ ...input, userId: input.userId ? toObjectId(input.userId) : undefined });
    await audit(req.user.id, "NOTIFICATION_CREATED", "Notification", notification.id);
    res.status(201).json(notification);
});
platformRoutes.patch("/notifications/:id/read", async (req, res) => {
    const where = { _id: req.params.id, ...(!["SUPER_ADMIN", "ADMIN"].includes(req.user.role) ? { userId: toObjectId(req.user.id) } : {}) };
    res.json(await Notification.findOneAndUpdate(where, { readAt: new Date() }, { new: true }).orFail());
});
platformRoutes.delete("/notifications/:id", async (req, res) => {
    const where = { _id: req.params.id, ...(!["SUPER_ADMIN", "ADMIN"].includes(req.user.role) ? { userId: toObjectId(req.user.id) } : {}) };
    await Notification.findOneAndDelete(where).orFail();
    res.json({ deleted: true });
});
platformRoutes.get("/settings", allowRoles("SUPER_ADMIN", "ADMIN"), async (_req, res) => {
    const settings = await AppSetting.findOneAndUpdate({ key: "global" }, { $setOnInsert: { key: "global" } }, { new: true, upsert: true }).select("+smtpPassword");
    res.json(settingsPayload(settings));
});
platformRoutes.patch("/settings", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const input = z.object({
        organizationName: z.string().trim().min(2).max(150), supportEmail: z.union([z.literal(""), z.string().email()]), defaultCurrency: z.string().trim().min(3).max(3),
        recordingCountdown: z.coerce.number().int().min(0).max(30), defaultPageSize: z.coerce.number().int().min(10).max(200), requireQaReview: z.boolean(), emailNotifications: z.boolean(),
        r2Enabled: z.boolean(), r2Bucket: z.string().trim().min(3).max(120), r2SinglePrefix: z.string().trim().min(1).max(120), r2DualPrefix: z.string().trim().min(1).max(120), r2Endpoint: z.string().trim().url(), r2AccountId: z.string().trim().min(8).max(128), r2AccessKey: z.string().trim().max(256), r2SecretKey: z.string().trim().max(256),
        smtpHost: z.string().trim().max(255), smtpPort: z.coerce.number().int().min(1).max(65535), smtpSecure: z.boolean(), smtpUser: z.string().trim().max(255), smtpPassword: z.string().trim().max(512), smtpFrom: z.string().trim().max(320).refine((value) => !value.includes("\n") && !value.includes("\r"), "SMTP sender must be one line")
    }).partial().parse(req.body);
    if (!Object.keys(input).length) throw new HttpError(400, "Choose at least one setting to save.", "SETTINGS_EMPTY");
    const { r2Endpoint, r2AccountId, r2AccessKey, r2SecretKey, smtpPassword, ...settingsInput } = input;
    const r2Values = { S3_ENDPOINT: r2Endpoint, R2_ACCOUNT_ID: r2AccountId, S3_ACCESS_KEY: r2AccessKey, S3_SECRET_KEY: r2SecretKey };
    if (Object.values(r2Values).some((value) => value !== undefined)) await saveR2Environment(r2Values);
    const settings = await AppSetting.findOneAndUpdate({ key: "global" }, { ...settingsInput, ...(input.smtpPort === 587 ? { smtpSecure: false } : {}), ...(smtpPassword ? { smtpPassword } : {}), updatedById: toObjectId(req.user.id) }, { new: true, upsert: true, runValidators: true });
    await audit(req.user.id, "SETTINGS_UPDATED", "AppSetting", settings.id, { r2CredentialsUpdated: Boolean(r2AccessKey || r2SecretKey), smtpPasswordUpdated: Boolean(smtpPassword) });
    res.json(settingsPayload(await AppSetting.findById(settings.id).select("+smtpPassword")));
});
platformRoutes.get("/audit-logs", allowRoles("SUPER_ADMIN", "ADMIN"), async (req, res) => {
    const { skip, limit } = pageArgs(req.query);
    const logs = await AuditLog.find().populate("actorId", "name email role").sort({ createdAt: -1 }).skip(skip).limit(limit);
    res.json(logs.map((log) => ({ ...json(log), actor: log.actorId ? json(log.actorId) : undefined })));
});
