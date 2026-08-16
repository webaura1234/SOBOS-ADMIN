import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { config } from "dotenv";

const require = createRequire(import.meta.url);

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/prisma-env.mjs <prisma args...|seed>");
  process.exit(1);
}

const commandArgs =
  args[0] === "seed"
    ? [require.resolve("tsx/cli"), "prisma/seed.ts", ...args.slice(1)]
    : [require.resolve("prisma/build/index.js"), ...args];

const child = spawn(process.execPath, commandArgs, {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
