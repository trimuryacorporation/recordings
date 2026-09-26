import mongoose from "mongoose";
function sanitizeMongoUri(uri) {
    try {
        const parsed = new URL(uri);
        if (parsed.password)
            parsed.password = "***";
        return parsed.toString();
    }
    catch {
        return uri.replace(/\/\/([^:/@]+):([^@]+)@/, "//$1:***@");
    }
}
export async function connectMongo() {
    const uri = process.env.MONGO_URI?.trim();
    const timeoutMs = Number(process.env.MONGO_TIMEOUT_MS ?? 8_000);
    if (!uri) {
        throw new Error("MONGO_URI is required in backend/.env.");
    }
    mongoose.set("strictQuery", true);
    try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: timeoutMs });
        console.log(`MongoDB connected: ${sanitizeMongoUri(uri)}`);
    }
    catch (error) {
        await mongoose.disconnect().catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to connect to MongoDB at ${sanitizeMongoUri(uri)}: ${message}`);
    }
}
export async function disconnectMongo() {
    await mongoose.disconnect();
}
export function toObjectId(id) {
    return id && mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : undefined;
}
