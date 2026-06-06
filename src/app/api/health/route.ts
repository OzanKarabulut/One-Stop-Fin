import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Check DB
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: e instanceof Error ? e.message : "Unknown error" },
      { status: 503 }
    );
  }
}
