#!/usr/bin/env node
/**
 * Docker'sız lokal başlatıcı.
 * Embedded PostgreSQL başlatır, migrate + seed yapar, sonra Next.js dev server açar.
 */
import EmbeddedPostgres from "embedded-postgres";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(PROJECT_DIR, ".pgdata");

const DB_USER = "onestopfin";
const DB_PASS = "onestopfin";
const DB_NAME = "onestopfin";
const DB_PORT = 5432;

const DATABASE_URL = `postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}`;

process.env.DATABASE_URL = DATABASE_URL;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: DB_USER,
  password: DB_PASS,
  port: DB_PORT,
  persistent: true,
});

async function main() {
  console.log("[start-local] PostgreSQL başlatılıyor...");

  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    await pg.initialise();
  }

  await pg.start();
  console.log(`[start-local] PostgreSQL çalışıyor (port ${DB_PORT})`);

  // Veritabanı oluştur (yoksa)
  try {
    await pg.createDatabase(DB_NAME);
  } catch (e) {
    // Zaten varsa sorun yok
  }

  // Prisma migrate
  console.log("[start-local] Prisma migrate çalıştırılıyor...");
  execSync("npx prisma migrate deploy", {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });

  // Seed (varsa)
  console.log("[start-local] Seed çalıştırılıyor...");
  try {
    execSync("npx tsx prisma/seed.ts", {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL },
    });
  } catch (e) {
    console.log("[start-local] Seed atlandı veya zaten mevcut.");
  }

  // Next.js dev server
  console.log("[start-local] Next.js başlatılıyor...");
  const next = spawn("npx", ["next", "dev", "--port", "3000"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL, PORT: "3000" },
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("\n[start-local] Kapatılıyor...");
    next.kill();
    await pg.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  next.on("exit", async (code) => {
    await pg.stop();
    process.exit(code || 0);
  });
}

main().catch(async (err) => {
  console.error("[start-local] Hata:", err.message);
  try { await pg.stop(); } catch {}
  process.exit(1);
});
