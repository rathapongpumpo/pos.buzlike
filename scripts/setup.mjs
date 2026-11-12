import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const password = randomBytes(24).toString("hex");
  let env = readFileSync(".env.example", "utf8")
    .replace("CHANGE_ME", password)
    .replace("GENERATE_WITH_SETUP", randomBytes(48).toString("hex"));
  env = env
    .replace(
      "SEED_OWNER_PASSWORD=",
      `SEED_OWNER_PASSWORD=${randomBytes(12).toString("base64url")}`,
    )
    .replace(
      "SEED_ADMIN_PASSWORD=",
      `SEED_ADMIN_PASSWORD=${randomBytes(18).toString("base64url")}`,
    );
  writeFileSync(".env", env);
  console.log("Created .env with random local credentials.");
} else console.log("Keeping existing .env.");
