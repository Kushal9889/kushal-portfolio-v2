import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseRum, RUM_MAX_BYTES } from "@/lib/rum";

export const runtime = "nodejs";

/**
 * Field-data sink (ADR-004). Off unless NEXT_PUBLIC_RUM is "1". Validates the
 * beacon, drops everything outside the schema, appends one line to a daily file
 * under .data/rum/. A read-only filesystem (serverless) loses the line and
 * nothing else: the page never depends on this route.
 */
const PER_MINUTE = 20;
const seen = new Map<string, number>();

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_RUM !== "1") return new Response(null, { status: 204 });

  // The address is hashed into a counter that lives in memory for one minute; it is never written.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const key = createHash("sha256").update(`${ip}:${Math.floor(Date.now() / 60000)}`).digest("hex").slice(0, 16);
  const n = (seen.get(key) ?? 0) + 1;
  if (seen.size > 5000) seen.clear();
  seen.set(key, n);
  if (n > PER_MINUTE) return new Response(null, { status: 429 });

  const body = await req.text();
  if (body.length > RUM_MAX_BYTES) return new Response(null, { status: 413 });
  let beacon;
  try {
    beacon = parseRum(JSON.parse(body));
  } catch {
    beacon = null;
  }
  if (!beacon) return new Response(null, { status: 400 });

  try {
    const dir = join(process.cwd(), ".data", "rum");
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${new Date().toISOString().slice(0, 10)}.jsonl`), JSON.stringify(beacon) + "\n");
  } catch {
    // No writable disk: the beacon is dropped.
  }
  return new Response(null, { status: 204 });
}
