import { randomBytes, createCipheriv } from "crypto";
import "dotenv/config";

const secretKey = Buffer.from(randomBytes(32));
const iv = Buffer.from(randomBytes(16));

const cipher = createCipheriv("aes-256-cbc", secretKey, iv);
const ENCRYPTED_PRIVATE_KEYS = Buffer.concat([cipher.update(process.env.PRIVATE_KEYS!), cipher.final()]).toString(
  "hex",
);

console.log({
  ENCRYPTION_IV: iv.toString("hex"),
  ENCRYPTION_SECRET_KEY: secretKey.toString("hex"),
  ENCRYPTED_PRIVATE_KEYS,
});
