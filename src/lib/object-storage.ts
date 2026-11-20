import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { HttpError } from "@/lib/http";

type StorageClient = { client: S3Client; bucket: string };
let storage: StorageClient | undefined;

function getStorage(): StorageClient {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || "auto";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new HttpError(503, "Object storage is not configured", "STORAGE_NOT_CONFIGURED");
  }
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("Unsupported storage endpoint");
    }
  } catch {
    throw new HttpError(503, "Object storage configuration is invalid", "STORAGE_NOT_CONFIGURED");
  }
  if (!storage || storage.bucket !== bucket) {
    storage = {
      bucket,
      client: new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }
  return storage;
}

export async function putPrivateObject(key: string, body: Buffer, contentType: string) {
  const { client, bucket } = getStorage();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentLength: body.byteLength,
    ContentType: contentType,
  }));
}

export async function deletePrivateObject(key: string) {
  const { client, bucket } = getStorage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getPrivateObject(key: string) {
  const { client, bucket } = getStorage();
  return client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getPrivateObjectUrl(key: string, fileName: string, contentType: string) {
  const { client, bucket } = getStorage();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
      ResponseContentType: contentType,
    }),
    { expiresIn: 60 },
  );
}
