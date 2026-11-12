import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, constants } from "node:fs";
import { appendFile, open, copyFile, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
const MAGIC = Buffer.from("BUZPOS01");
export function backupKey(value: string | undefined) {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw Error(
      "BACKUP_ENCRYPTION_KEY must be 32 random bytes encoded as base64",
    );
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw Error("Invalid backup key");
  return key;
}
export async function encryptBackup(
  input: Readable,
  output: string,
  key: Buffer,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv),
    destination = createWriteStream(output, { flags: "wx", mode: 0o600 });
  destination.write(Buffer.concat([MAGIC, iv]));
  await pipeline(input, cipher, destination);
  await appendFile(output, cipher.getAuthTag());
}
export async function decryptBackup(
  input: string,
  output: string,
  key: Buffer,
) {
  const file = await open(input, "r"),
    partial = output + ".partial-" + randomBytes(8).toString("hex");
  try {
    const size = (await file.stat()).size,
      header = Buffer.alloc(20),
      tag = Buffer.alloc(16);
    if (size < 36) throw Error("Backup truncated");
    await file.read(header, 0, 20, 0);
    await file.read(tag, 0, 16, size - 16);
    if (!header.subarray(0, 8).equals(MAGIC))
      throw Error("Unknown backup format");
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(8));
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(input, { start: 20, end: size - 17 }),
      decipher,
      createWriteStream(partial, { flags: "wx", mode: 0o600 }),
    );
    // Publish plaintext only after authentication; never overwrite an existing target.
    await copyFile(partial, output, constants.COPYFILE_EXCL);
  } finally {
    await file.close();
    await unlink(partial).catch(() => {});
  }
}
