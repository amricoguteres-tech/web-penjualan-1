import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import test from "node:test";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

if (!process.env.TEST_DATABASE_URL || !process.env.TEST_DATABASE_URL.includes("_test")) {
  throw new Error("Run this integration test through npm run test:integration with a dedicated *_test database");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!Reflect.set(process.env, "NODE_ENV", "test")) {
  throw new Error("Unable to set NODE_ENV for integration tests");
}
process.env.EMAIL_OUTBOX_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString("base64");

test("Redis, SMTP outbox, S3 storage, retries, crash recovery, and expiring signed URLs work", async () => {
  const [
    { createClient },
    { EmailOutboxStatus },
    { prisma },
    { processEmailOutboxBatch },
    { sendVerifiedEmail },
    { deletePrivateObject, getPrivateObject, getPrivateObjectUrl, putPrivateObject },
  ] = await Promise.all([
    import("redis"),
    import("@prisma/client"),
    import("../src/lib/prisma"),
    import("../src/lib/email-outbox"),
    import("../src/lib/mailer"),
    import("../src/lib/object-storage"),
  ]);
  const redisUrl = process.env.REDIS_URL;
  const smtpServer = process.env.EMAIL_SERVER;
  const smtpFrom = process.env.EMAIL_FROM;
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  assert.ok(redisUrl && smtpServer && smtpFrom && endpoint && bucket && accessKeyId && secretAccessKey);

  const redis = createClient({ url: redisUrl });
  const s3 = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  const suffix = randomUUID();
  const redisKey = `nebula:test:${suffix}`;
  const storageKey = `integration/${suffix}.txt`;
  const idempotencyKeys = [
    `integration:${suffix}`,
    `integration-recovery:${suffix}`,
    `integration-failure:${suffix}`,
    `integration-crash:${suffix}`,
    `integration-timeout:${suffix}`,
    `integration-exhausted:${suffix}`,
  ];
  let createdBucket = false;
  const hangingSmtp = createServer((socket) => socket.on("error", () => {}));

  try {
    await redis.connect();
    assert.equal(await redis.ping(), "PONG");
    assert.equal(await redis.set(redisKey, "test", { EX: 30 }), "OK");
    assert.equal(await redis.get(redisKey), "test");

    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      createdBucket = true;
    }
    const asset = Buffer.from(`NEBULA integration ${suffix}`);
    await putPrivateObject(storageKey, asset, "text/plain");
    const stored = await getPrivateObject(storageKey);
    assert.deepEqual(Buffer.from(await stored.Body!.transformToByteArray()), asset);
    const publicRequest = await fetch(`${endpoint}/${bucket}/${storageKey}`);
    assert.ok(!publicRequest.ok, "private object should not be downloadable without a signed URL");
    const signedUrl = await getPrivateObjectUrl(storageKey, "integration.txt", "text/plain");
    const downloaded = await fetch(signedUrl);
    assert.equal(downloaded.status, 200);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), asset);
    const expiringUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
      { expiresIn: 1 },
    );
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    assert.ok(!(await fetch(expiringUrl)).ok, "short-lived signed URL should expire");

    process.env.EMAIL_SERVER = smtpServer;
    const queued = await prisma.emailOutbox.create({
      data: {
        idempotencyKey: idempotencyKeys[0],
        recipient: `integration-${suffix}@example.test`,
        subject: `NEBULA integration ${suffix}`,
        textBody: "This integration email must reach the isolated test SMTP service.",
        maxAttempts: 3,
      },
    });
    assert.equal(queued.status, EmailOutboxStatus.QUEUED);
    assert.deepEqual(await processEmailOutboxBatch(1), [{ id: queued.id, status: "sent" }]);
    const sent = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: queued.id } });
    assert.equal(sent.status, EmailOutboxStatus.SENT);
    assert.equal(sent.textBody.includes("isolated test SMTP service"), false, "stored outbox body must remain encrypted");

    const mailpitUrl = new URL("/api/v1/messages", process.env.MAILPIT_API_URL || "http://127.0.0.1:58025");
    const mailpitResponse = await fetch(mailpitUrl);
    assert.equal(mailpitResponse.status, 200);
    const mailpitBody = await mailpitResponse.json() as { messages?: Array<{ Subject?: string; subject?: string }> };
    assert.ok(
      mailpitBody.messages?.some((message) => (message.Subject ?? message.subject) === `NEBULA integration ${suffix}`),
      "Mailpit must contain the test message; SMTP acceptance is separately recorded",
    );

    const recovery = await prisma.emailOutbox.create({
      data: {
        idempotencyKey: idempotencyKeys[1],
        recipient: `recovery-${suffix}@example.test`,
        subject: `NEBULA recovery ${suffix}`,
        textBody: "Worker recovery fixture",
        status: EmailOutboxStatus.PROCESSING,
        attempts: 1,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    assert.deepEqual(await processEmailOutboxBatch(1), [{ id: recovery.id, status: "sent" }]);

    const duplicateSubject = `NEBULA crash-window ${suffix}`;
    const duplicateRecipient = `duplicate-${suffix}@example.test`;
    await sendVerifiedEmail({
      to: duplicateRecipient,
      subject: duplicateSubject,
      text: "SMTP accepted before the simulated worker crash.",
    });
    const crashWindow = await prisma.emailOutbox.create({
      data: {
        idempotencyKey: idempotencyKeys[3],
        recipient: duplicateRecipient,
        subject: duplicateSubject,
        textBody: "SMTP accepted before the simulated worker crash.",
        status: EmailOutboxStatus.PROCESSING,
        attempts: 1,
        maxAttempts: 3,
        startedAt: new Date(Date.now() - 10 * 60_000),
      },
    });
    assert.deepEqual(await processEmailOutboxBatch(1), [{ id: crashWindow.id, status: "sent" }]);
    const duplicateMessages = await (await fetch(mailpitUrl)).json() as {
      messages?: Array<{ Subject?: string; subject?: string }>;
    };
    assert.equal(
      duplicateMessages.messages?.filter((message) => (message.Subject ?? message.subject) === duplicateSubject).length,
      2,
      "recovery after SMTP acceptance but before SENT is at-least-once and can duplicate delivery",
    );

    process.env.EMAIL_SERVER = "smtp://127.0.0.1:1";
    const failed = await prisma.emailOutbox.create({
      data: {
        idempotencyKey: idempotencyKeys[2],
        recipient: `failure-${suffix}@example.test`,
        subject: "Expected SMTP failure",
        textBody: "Failure path",
        maxAttempts: 2,
      },
    });
    assert.deepEqual(await processEmailOutboxBatch(1), [{ id: failed.id, status: "queued_for_retry" }]);
    const retryState = await prisma.emailOutbox.findUniqueOrThrow({ where: { id: failed.id } });
    assert.equal(retryState.attempts, 1);
    assert.equal(retryState.status, EmailOutboxStatus.QUEUED);
    assert.ok(retryState.availableAt > new Date(Date.now() - 100));
    await prisma.emailOutbox.update({
      where: { id: failed.id },
      data: { availableAt: new Date(Date.now() - 1_000) },
    });
    process.env.EMAIL_SERVER = smtpServer;
    assert.deepEqual(await processEmailOutboxBatch(1), [{ id: failed.id, status: "sent" }]);

    await new Promise<void>((resolve, reject) => {
      hangingSmtp.once("error", reject);
      hangingSmtp.listen(0, "127.0.0.1", resolve);
    });
    const address = hangingSmtp.address();
    assert.ok(address && typeof address !== "string");
    process.env.EMAIL_SERVER = `smtp://127.0.0.1:${address.port}`;
    const timeout = await prisma.emailOutbox.create({
      data: {
        idempotencyKey: idempotencyKeys[4],
        recipient: `timeout-${suffix}@example.test`,
        subject: "Expected SMTP greeting timeout",
        textBody: "Timeout fixture",
        maxAttempts: 1,
      },
    });
    const timeoutStarted = Date.now();
    assert.deepEqual(await processEmailOutboxBatch(1), [{ id: timeout.id, status: "failed" }]);
    assert.ok(Date.now() - timeoutStarted >= 4_000, "SMTP greeting timeout should use its configured timeout");
    await new Promise<void>((resolve) => hangingSmtp.close(() => resolve()));

    const exhausted = await prisma.emailOutbox.create({
      data: {
        idempotencyKey: idempotencyKeys[5],
        recipient: `exhausted-${suffix}@example.test`,
        subject: "Exhausted retry fixture",
        textBody: "Exhausted",
        status: EmailOutboxStatus.QUEUED,
        attempts: 3,
        maxAttempts: 3,
      },
    });
    assert.deepEqual(await processEmailOutboxBatch(1), []);
    assert.equal((await prisma.emailOutbox.findUniqueOrThrow({ where: { id: exhausted.id } })).status, EmailOutboxStatus.FAILED);
  } finally {
    process.env.EMAIL_SERVER = smtpServer;
    if (hangingSmtp.listening) await new Promise<void>((resolve) => hangingSmtp.close(() => resolve()));
    await prisma.emailOutbox.deleteMany({ where: { idempotencyKey: { in: idempotencyKeys } } });
    await redis.del(redisKey).catch(() => undefined);
    await redis.quit().catch(() => undefined);
    await deletePrivateObject(storageKey).catch(() => undefined);
    if (createdBucket) await s3.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    s3.destroy();
    await prisma.$disconnect();
  }
});
