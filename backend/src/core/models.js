import mongoose, { Schema } from "mongoose";
const schemaOptions = {
    timestamps: true,
    toJSON: {
        virtuals: true,
        versionKey: false,
        transform: (_doc, ret) => {
            ret.id = String(ret._id);
            delete ret._id;
        }
    },
    toObject: { virtuals: true, versionKey: false }
};
const objectId = Schema.Types.ObjectId;
export const User = mongoose.model("User", new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    phone: String,
    mobile: String,
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ["SUPER_ADMIN", "ADMIN", "QA", "VENDOR", "RECORDER"] },
    platformType: { type: String, enum: ["SINGLE_RECORDING", "DUAL_RECORDING", "SCRIPT_RECORDING"], default: "SCRIPT_RECORDING" },
    recordingMode: { type: String, enum: ["SCRIPTED", "NON_SCRIPTED"], default: "SCRIPTED" },
    vendorId: { type: objectId, ref: "Vendor" },
    createdById: { type: objectId, ref: "User", index: true },
    languages: { type: [String], default: [] },
    status: { type: String, default: "ACTIVE" },
    lastActiveAt: Date,
    deletedAt: Date
}, schemaOptions));
export const Client = mongoose.model("Client", new Schema({ name: { type: String, required: true }, code: { type: String, required: true, unique: true }, contact: String, email: String, deletedAt: Date }, schemaOptions));
export const Vendor = mongoose.model("Vendor", new Schema({
    companyName: { type: String, required: true },
    contactPerson: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    country: String,
    address: String,
    status: { type: String, default: "ACTIVE" },
    deletedAt: Date
}, schemaOptions));
export const Project = mongoose.model("Project", new Schema({
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    clientId: { type: objectId, ref: "Client", required: true },
    description: String,
    recordingType: { type: String, enum: ["SINGLE", "DUAL"], required: true },
    scriptLanguage: { type: String, required: true },
    targetRecordings: { type: Number, default: 0 },
    startDate: Date,
    endDate: Date,
    vendorId: { type: objectId, ref: "Vendor" },
    qaRules: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "DRAFT" },
    deletedAt: Date
}, schemaOptions));
export const Script = mongoose.model("Script", new Schema({
    scriptCode: { type: String, required: true, unique: true },
    projectId: { type: objectId, ref: "Project", required: true },
    title: { type: String, required: true },
    category: String,
    language: String,
    currentText: String,
    expectedDuration: Number,
    recordingType: { type: String, enum: ["SINGLE", "DUAL"], required: true },
    status: { type: String, default: "ACTIVE" },
    version: { type: Number, default: 1 },
    createdById: { type: objectId, ref: "User" },
    deletedAt: Date
}, schemaOptions));
export const ScriptVersion = mongoose.model("ScriptVersion", new Schema({ scriptId: { type: objectId, ref: "Script", index: true }, version: Number, text: String, createdBy: String }, schemaOptions));
export const RecordingTask = mongoose.model("RecordingTask", new Schema({
    taskCode: { type: String, required: true, unique: true },
    projectId: { type: objectId, ref: "Project", required: true },
    scriptId: { type: objectId, ref: "Script", required: true },
    recordingType: { type: String, enum: ["SINGLE", "DUAL"], required: true },
    vendorId: { type: objectId, ref: "Vendor" },
    participantAId: { type: objectId, ref: "User" },
    participantBId: { type: objectId, ref: "User" },
    status: { type: String, default: "UNASSIGNED" },
    priority: { type: String, default: "NORMAL" },
    dueDate: Date,
    deletedAt: Date
}, schemaOptions));
const participantSchema = new Schema({
    userId: { type: objectId, ref: "User" },
    label: String,
    connection: { type: String, default: "DISCONNECTED" },
    micReady: { type: Boolean, default: false },
    cameraReady: { type: Boolean, default: false },
    networkOk: { type: Boolean, default: false },
    ready: { type: Boolean, default: false },
    deviceMeta: { type: Schema.Types.Mixed, default: {} },
    joinedAt: Date
}, { _id: false });
export const RecordingSession = mongoose.model("RecordingSession", new Schema({
    sessionCode: { type: String, required: true, unique: true },
    projectId: { type: objectId, ref: "Project" },
    taskId: { type: objectId, ref: "RecordingTask" },
    scriptId: { type: objectId, ref: "Script" },
    participantAId: { type: objectId, ref: "User" },
    participantBId: { type: objectId, ref: "User" },
    recordingType: { type: String, enum: ["SINGLE", "DUAL"], required: true },
    status: { type: String, default: "CREATED" },
    participants: { type: [participantSchema], default: [] },
    startedAt: Date,
    endedAt: Date,
    durationSeconds: Number,
    syncMetadata: { type: Schema.Types.Mixed, default: {} },
    uploadStatus: { type: String, default: "INITIATED" },
    qaStatus: { type: String, default: "NOT_SUBMITTED" }
}, schemaOptions));
export const MediaFile = mongoose.model("MediaFile", new Schema({
    fileKey: { type: String, required: true, unique: true },
    bucket: String,
    size: Number,
    mimeType: String,
    durationSeconds: Number,
    checksum: String,
    storageProvider: String,
    uploadStatus: { type: String, default: "INITIATED" },
    signedUrl: String
}, schemaOptions));
export const RecordingTrack = mongoose.model("RecordingTrack", new Schema({
    recordingId: { type: objectId, ref: "Recording" },
    sessionId: { type: objectId, ref: "RecordingSession", required: true },
    participantLabel: String,
    kind: String,
    mediaFileId: { type: objectId, ref: "MediaFile" },
    timestamps: { type: Schema.Types.Mixed, default: {} },
    deviceMetadata: { type: Schema.Types.Mixed, default: {} }
}, schemaOptions));
export const Recording = mongoose.model("Recording", new Schema({
    recordingCode: { type: String, required: true, unique: true },
    projectId: { type: objectId, ref: "Project", required: true },
    taskId: { type: objectId, ref: "RecordingTask", required: true },
    sessionId: { type: objectId, ref: "RecordingSession" },
    userId: { type: objectId, ref: "User" },
    vendorId: { type: objectId, ref: "Vendor" },
    recordingType: { type: String, enum: ["SINGLE", "DUAL"], required: true },
    duration: Number,
    qaStatus: { type: String, default: "QA_PENDING" },
    uploadedAt: Date
}, schemaOptions));
export const ManualRecording = mongoose.model("ManualRecording", new Schema({
    userId: { type: objectId, ref: "User", required: true },
    mediaFileId: { type: objectId, ref: "MediaFile", required: true },
    duration: Number,
    kind: { type: String, default: "audio" },
    uploadedAt: { type: Date, default: Date.now }
}, schemaOptions));
export const Invitation = mongoose.model("Invitation", new Schema({
    tokenHash: { type: String, required: true, unique: true },
    projectId: { type: objectId, ref: "Project" },
    taskId: { type: objectId, ref: "RecordingTask" },
    sessionId: { type: objectId, ref: "RecordingSession" },
    invitedById: { type: objectId, ref: "User" },
    email: String,
    participantRole: String,
    status: { type: String, default: "PENDING" },
    expiresAt: Date,
    acceptedAt: Date
}, schemaOptions));
export const QaCriteria = mongoose.model("QaCriteria", new Schema({ name: String, weight: Number, active: { type: Boolean, default: true } }, schemaOptions));
export const QaReview = mongoose.model("QaReview", new Schema({
    recordingId: { type: objectId, ref: "Recording", required: true },
    reviewerId: { type: objectId, ref: "User", required: true },
    decision: { type: String, enum: ["APPROVE", "REJECT", "RE_RECORD"], required: true },
    score: Number,
    rejectionReason: String,
    comments: String,
    history: { type: [Schema.Types.Mixed], default: [] },
    scores: { type: [Schema.Types.Mixed], default: [] }
}, schemaOptions));
export const Notification = mongoose.model("Notification", new Schema({ userId: { type: objectId, ref: "User" }, type: String, title: String, message: String, readAt: Date, metadata: { type: Schema.Types.Mixed, default: {} } }, schemaOptions));
export const Invoice = mongoose.model("Invoice", new Schema({
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    clientName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    dueDate: Date,
    status: { type: String, enum: ["DRAFT", "PENDING", "PAID", "OVERDUE", "CANCELLED"], default: "PENDING" },
    notes: String,
    createdById: { type: objectId, ref: "User" }
}, schemaOptions));
export const VendorPayment = mongoose.model("VendorPayment", new Schema({
    paymentNumber: { type: String, required: true, unique: true, index: true },
    vendorId: { type: objectId, ref: "Vendor", required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    period: String,
    reference: String,
    paidAt: Date,
    status: { type: String, enum: ["PENDING", "PROCESSING", "PAID", "FAILED"], default: "PENDING" },
    createdById: { type: objectId, ref: "User" }
}, schemaOptions));
export const AppSetting = mongoose.model("AppSetting", new Schema({
    key: { type: String, required: true, unique: true, default: "global" },
    organizationName: { type: String, default: "Trimurya Corporation Pvt. Ltd." },
    supportEmail: { type: String, default: "" },
    defaultCurrency: { type: String, default: "INR" },
    recordingCountdown: { type: Number, default: 5, min: 0, max: 30 },
    defaultPageSize: { type: Number, default: 100, min: 10, max: 200 },
    requireQaReview: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    updatedById: { type: objectId, ref: "User" }
}, schemaOptions));
export const AuditLog = mongoose.model("AuditLog", new Schema({ actorId: { type: objectId, ref: "User" }, action: String, entity: String, entityId: String, ip: String, metadata: { type: Schema.Types.Mixed, default: {} } }, schemaOptions));
