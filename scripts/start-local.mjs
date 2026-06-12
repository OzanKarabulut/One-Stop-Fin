#!/usr/bin/env node
/**
 * Docker'sız lokal başlatıcı — prod mode.
 * Embedded PostgreSQL başlatır, migrate + seed yapar, sonra Next.js production server açar.
 */
import EmbeddedPostgres from "embedded-postgres";
import { execSync, spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
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
process.env.NEXT_TELEMETRY_DISABLED = "1";

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: DB_USER,
  password: DB_PASS,
  port: DB_PORT,
  persistent: true,
});

let next = null;
let shuttingDown = false;

// Idempotent shutdown
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[start-local] Kapatılıyor...");
  try { next?.kill(); } catch {}
  try { await pg.stop(); } catch {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Suppress pg-protocol noise during shutdown
process.on("uncaughtException", (err) => {
  if (shuttingDown) return;
  console.error("[start-local] Uncaught:", err);
  process.exit(1);
});

async function main() {
  // ─── Stale postmaster.pid cleanup ──────────────────────────────────────
  const pmPidFile = path.join(DATA_DIR, "postmaster.pid");
  if (existsSync(pmPidFile)) {
    try {
      const pidStr = readFileSync(pmPidFile, "utf-8").split("\n")[0].trim();
      const pid = parseInt(pidStr, 10);
      if (pid > 0) {
        try { process.kill(pid, 0); } catch (e) {
          if (e.code === "ESRCH") {
            unlinkSync(pmPidFile);
            console.log(`[start-local] Stale postmaster.pid temizlendi (PID ${pid} ölü)`);
          }
        }
      }
    } catch {}
  }

  // ─── PostgreSQL ────────────────────────────────────────────────────────
  console.log("[start-local] PostgreSQL başlatılıyor...");
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  console.log(`[start-local] PostgreSQL çalışıyor (port ${DB_PORT})`);

  // Veritabanı oluştur (yoksa)
  try { await pg.createDatabase(DB_NAME); } catch {}

  // ─── Prisma migrate ────────────────────────────────────────────────────
  console.log("[start-local] Prisma migrate çalıştırılıyor...");
  execSync("npx prisma migrate deploy", {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL },
  });

  // ─── Seed ──────────────────────────────────────────────────────────────
  console.log("[start-local] Seed çalıştırılıyor...");
  try {
    execSync("npx tsx prisma/seed.ts", {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL },
    });
  } catch {
    console.log("[start-local] Seed atlandı veya zaten mevcut.");
  }

  // ─── Mode ───────────────────────────────────────────────────────────────
  const MODE = process.env.ONESTOPFIN_MODE === "prod" ? "prod" : "dev";

  if (MODE === "prod") {
    // ─── Build tazeliği kontrolü ─────────────────────────────────────────
    const buildRevFile = path.join(PROJECT_DIR, ".next", ".build-git-rev");
    const buildIdFile = path.join(PROJECT_DIR, ".next", "BUILD_ID");
    let currentRev = "";
    try { currentRev = execSync("git rev-parse HEAD", { cwd: PROJECT_DIR, encoding: "utf-8" }).trim(); } catch {}
    let savedRev = "";
    try { savedRev = readFileSync(buildRevFile, "utf-8").trim(); } catch {}

    const needsBuild = !existsSync(buildIdFile) || savedRev !== currentRev;

    if (needsBuild) {
      console.log("[start-local] Build eski/yok, önce build alınıyor...");
      execSync("npx next build", {
        cwd: PROJECT_DIR,
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL },
      });
      try { writeFileSync(buildRevFile, currentRev, "utf-8"); } catch {}
      console.log("[start-local] Build tamamlandı.");
    } else {
      console.log("[start-local] Build güncel, next start...");
    }

    // ─── Next.js production server ───────────────────────────────────────
    console.log("[start-local] Next.js başlatılıyor (prod)...");
    next = spawn("npx", ["next", "start", "--port", "3000"], {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL, PORT: "3000" },
    });
  } else {
    // ─── Next.js dev server (hot reload) ─────────────────────────────────
    console.log("[start-local] Next.js başlatılıyor (dev, hot reload)...");
    next = spawn("npx", ["next", "dev", "--port", "3000"], {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL, PORT: "3000" },
    });
  }

  next.on("exit", async (code) => {
    if (!shuttingDown) {
      try { await pg.stop(); } catch {}
      process.exit(code || 0);
    }
  });
}

main().catch(async (err) => {
  console.error("[start-local] Hata:", err instanceof Error ? err.message : err);
  if (!shuttingDown) {
    try { await pg.stop(); } catch {}
    process.exit(1);
  }
});
