import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export class LocalStorageProvider {
    async initiateUpload(input) {
        const fileKey = `local/${crypto.randomUUID()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        return {
            fileKey,
            bucket: "local-development",
            provider: "local",
            uploadUrl: `/api/uploads/local/${encodeURIComponent(fileKey)}`
        };
    }
    async getSignedPlaybackUrl(fileKey) {
        return `/api/uploads/local/${encodeURIComponent(fileKey)}`;
    }
}
export class S3StorageProvider {
    client = new S3Client({
        region: process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT || undefined,
        credentials: process.env.S3_ACCESS_KEY
            ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY ?? "" }
            : undefined
    });
    async initiateUpload(input) {
        const bucket = process.env.S3_BUCKET ?? "";
        const fileKey = `recordings/${crypto.randomUUID()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const uploadUrl = await getSignedUrl(this.client, new PutObjectCommand({
            Bucket: bucket,
            Key: fileKey,
            ContentType: input.mimeType,
            ChecksumSHA256: input.checksum
        }), { expiresIn: 900 });
        return { fileKey, bucket, provider: "s3", uploadUrl };
    }
    async getSignedPlaybackUrl(fileKey) {
        const bucket = process.env.S3_BUCKET ?? "";
        return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: fileKey }), { expiresIn: 900 });
    }
    async deleteObject(fileKey, bucket = process.env.S3_BUCKET ?? "") {
        await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: fileKey }));
    }
}
export function storageProvider() {
    return process.env.STORAGE_PROVIDER === "s3" ? new S3StorageProvider() : new LocalStorageProvider();
}
