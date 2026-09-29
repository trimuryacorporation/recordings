import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class LocalStorageProvider {
    async initiateUpload(input) {
        const fileKey = `local/${crypto.randomUUID()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        return { fileKey, bucket: "local-development", provider: "local", uploadUrl: `/api/uploads/local/${encodeURIComponent(fileKey)}` };
    }
    async getSignedPlaybackUrl(fileKey) { return `/api/uploads/local/${encodeURIComponent(fileKey)}`; }
}

export class S3StorageProvider {
    constructor(config = {}) {
        this.bucket = config.bucket || process.env.S3_BUCKET || "";
        this.singlePrefix = (config.singlePrefix || process.env.R2_SINGLE_PREFIX || "single").replace(/^\/+|\/+$/g, "");
        this.dualPrefix = (config.dualPrefix || process.env.R2_DUAL_PREFIX || "dual").replace(/^\/+|\/+$/g, "");
        this.client = new S3Client({
            region: process.env.S3_REGION || "auto",
            endpoint: process.env.S3_ENDPOINT || undefined,
            credentials: process.env.S3_ACCESS_KEY ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY ?? "" } : undefined
        });
    }
    async initiateUpload(input) {
        if (!this.bucket) throw new Error("Cloudflare R2 bucket is not configured.");
        const prefix = input.recordingType === "DUAL" ? this.dualPrefix : this.singlePrefix;
        const fileKey = `${prefix}/${crypto.randomUUID()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: fileKey, ContentType: input.mimeType, ChecksumSHA256: input.checksum }), { expiresIn: 900 });
        return { fileKey, bucket: this.bucket, provider: "s3", uploadUrl };
    }
    async getSignedPlaybackUrl(fileKey, bucket = this.bucket) { return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: fileKey }), { expiresIn: 900 }); }
    async deleteObject(fileKey, bucket = this.bucket) { await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey })); }
}

export function storageProvider(config = {}) {
    return process.env.STORAGE_PROVIDER === "s3" && config.enabled !== false ? new S3StorageProvider(config) : new LocalStorageProvider();
}