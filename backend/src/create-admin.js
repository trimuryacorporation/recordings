import "./core/env.js";
import { hashPassword } from "./core/auth.js";
import { User } from "./core/models.js";
import { connectMongo, disconnectMongo } from "./core/mongo.js";

async function main() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !email.includes("@"))
        throw new Error("ADMIN_EMAIL must be a valid email address.");
    if (!password || password.length < 8)
        throw new Error("ADMIN_PASSWORD must contain at least 8 characters.");

    await connectMongo();
    const passwordHash = await hashPassword(password);
    const user = await User.findOneAndUpdate({ email }, {
        $set: {
            name: process.env.ADMIN_NAME?.trim() || "Admin",
            passwordHash,
            role: "ADMIN",
            platformType: "SCRIPT_RECORDING",
            recordingMode: "SCRIPTED",
            status: "ACTIVE"
        },
        $setOnInsert: {
            email,
            mobile: process.env.ADMIN_MOBILE?.trim() || `system-${email}`,
            languages: []
        }
    }, { upsert: true, new: true });
    console.log(`Admin account ready: ${user.email}`);
}

main()
    .then(() => disconnectMongo())
    .catch(async (error) => {
        console.error(error instanceof Error ? error.message : error);
        await disconnectMongo();
        process.exit(1);
    });
