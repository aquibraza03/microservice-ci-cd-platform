#!/usr/bin/env node
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    const chunks = [];
    child.stderr.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command} failed (${code}): ${Buffer.concat(chunks).toString("utf8").slice(0, 500)}`,
            ),
          ),
    );
  });
}

async function encryptFile(input, output, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("Backup encryption key must be 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  await new Promise((resolve, reject) =>
    fs
      .createReadStream(input)
      .pipe(cipher)
      .pipe(fs.createWriteStream(output, { flags: "wx", mode: 0o600 }))
      .on("finish", resolve)
      .on("error", reject),
  );
  const tag = cipher.getAuthTag();
  return {
    algorithm: "AES-256-GCM",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

async function decryptFile(input, output, key, encryption) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(encryption.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encryption.tag, "base64"));
  await new Promise((resolve, reject) =>
    fs
      .createReadStream(input)
      .pipe(decipher)
      .pipe(fs.createWriteStream(output, { flags: "wx", mode: 0o600 }))
      .on("finish", resolve)
      .on("error", reject),
  );
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) =>
    fs
      .createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject),
  );
  return hash.digest("hex");
}

async function createBackup({
  databaseUrl,
  outputDirectory,
  encryptionKey,
  backupId = crypto.randomUUID(),
  dump = run,
  now = () => new Date(),
}) {
  if (!databaseUrl || !outputDirectory)
    throw new Error("Database URL and output directory are required");
  await fsp.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const temporary = path.join(outputDirectory, `${backupId}.dump.incomplete`);
  const encrypted = path.join(outputDirectory, `${backupId}.dump.aes256gcm`);
  const manifestPath = path.join(outputDirectory, `${backupId}.manifest.json`);
  try {
    await dump(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        `--file=${temporary}`,
        databaseUrl,
      ],
      { env: { ...process.env, PGPASSFILE: process.env.PGPASSFILE } },
    );
    const encryption = await encryptFile(temporary, encrypted, encryptionKey);
    const stat = await fsp.stat(encrypted);
    const manifest = {
      schemaVersion: 1,
      backupId,
      createdAt: now().toISOString(),
      format: "postgres-custom",
      encryptedObject: path.basename(encrypted),
      bytes: stat.size,
      sha256: await sha256(encrypted),
      encryption: {
        ...encryption,
        keyVersion: process.env.BACKUP_KEY_VERSION || "unspecified",
      },
      complete: true,
      migrationsIncluded: true,
      uploadStatus: "local_complete_external_upload_required",
    };
    await fsp.writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    return { manifest, manifestPath, encryptedPath: encrypted };
  } catch (error) {
    await Promise.allSettled([fsp.unlink(encrypted), fsp.unlink(manifestPath)]);
    throw error;
  } finally {
    await fsp.unlink(temporary).catch(() => {});
  }
}

module.exports = { createBackup, decryptFile, encryptFile, run, sha256 };
