import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function loadTestEnvironment() {
  try {
    const contents = readFileSync(resolve(".env.test"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 1) throw new Error("Invalid .env.test entry");
      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error("Invalid .env.test variable name");
      process.env[key] = value;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function assertTestEnvironment() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required. Copy .env.test.example to .env.test and configure isolated services.");
  }
  let url: URL;
  try {
    url = new URL(testDatabaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1).split("/")[0] ?? "");
  const allowedLocalHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL");
  }
  if (!allowedLocalHosts.has(url.hostname)) {
    throw new Error("TEST_DATABASE_URL must target a local test service (use a local port-forward for remote test databases)");
  }
  if (!databaseName.endsWith("_test")) {
    throw new Error("Refusing to run integration tests: TEST_DATABASE_URL database name must end with _test");
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
    throw new Error("Refusing to run integration tests against DATABASE_URL; use a distinct TEST_DATABASE_URL");
  }
  const required = [
    "REDIS_URL",
    "EMAIL_SERVER",
    "EMAIL_FROM",
    "EMAIL_OUTBOX_ENCRYPTION_KEY",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing test service configuration: ${missing.join(", ")}`);
  }
  const redisUrl = new URL(process.env.REDIS_URL!);
  const smtpUrl = new URL(process.env.EMAIL_SERVER!);
  const storageUrl = new URL(process.env.S3_ENDPOINT!);
  if (!allowedLocalHosts.has(redisUrl.hostname)) throw new Error("REDIS_URL must point to a local test Redis service");
  if (!["smtp:", "smtps:"].includes(smtpUrl.protocol) || !allowedLocalHosts.has(smtpUrl.hostname)) {
    throw new Error("EMAIL_SERVER must point to a local SMTP test service");
  }
  if (smtpUrl.username || smtpUrl.password || !/\.(invalid|test)$/i.test(process.env.EMAIL_FROM!.split("@").at(-1) ?? "")) {
    throw new Error("SMTP integration tests must use an unauthenticated local sink and a .invalid/.test sender");
  }
  if (storageUrl.protocol !== "http:" || !allowedLocalHosts.has(storageUrl.hostname)) {
    throw new Error("S3_ENDPOINT must point to a local test storage service");
  }
  if (!/[-_]test$/i.test(process.env.S3_BUCKET!)) {
    throw new Error("S3_BUCKET must end in -test or _test");
  }
  if (process.env.MIDTRANS_IS_PRODUCTION === "true") {
    throw new Error("Refusing to run payment tests with production Midtrans mode");
  }

  if (!Reflect.set(process.env, "NODE_ENV", "test")) {
    throw new Error("Unable to set NODE_ENV for integration tests");
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.TRUST_PROXY_HEADERS = "true";
  if (process.env.TEST_MIDTRANS_SERVER_KEY) {
    process.env.MIDTRANS_SERVER_KEY = process.env.TEST_MIDTRANS_SERVER_KEY;
  }
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

loadTestEnvironment();
assertTestEnvironment();
run("npx", ["prisma", "migrate", "deploy"]);
const tests = readdirSync("tests")
  .filter((name) => name.endsWith(".integration.test.ts"))
  .map((name) => resolve("tests", name));
if (tests.length === 0) throw new Error("No integration test files were found");
run(process.execPath, ["--import", "tsx", "--test-concurrency=1", "--test", ...tests]);
