import { loadCertifications, loadContent } from "@/lib/content";
import { credentialConfirmed } from "@/lib/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECK_MS = 4_000;
const KEEP_MS = 10 * 60_000;

type Check = { id: string; confirmed: boolean };
let last: { at: number; checks: Check[] } | null = null;

/**
 * Asks Credly about the pinned credentials. The URLs come from the corpus, never
 * the request, and one answer is reused for ten minutes so visitors cannot turn
 * this route into traffic against Credly.
 */
export async function GET() {
  if (!last || Date.now() - last.at > KEEP_MS) {
    const holder = String(loadContent().profile.name ?? "").split(" ")[0];
    const checks = await Promise.all(
      loadCertifications()
        .filter((c) => c.pinned && c.url?.startsWith("https://www.credly.com/"))
        .map(async (c): Promise<Check> => {
          try {
            const res = await fetch(c.url as string, { signal: AbortSignal.timeout(CHECK_MS), headers: { "user-agent": "Mozilla/5.0" } });
            return { id: c.id, confirmed: res.ok && credentialConfirmed(await res.text(), c.name, holder) };
          } catch {
            return { id: c.id, confirmed: false };
          }
        }),
    );
    last = { at: Date.now(), checks };
  }
  return Response.json({ checkedAt: new Date(last.at).toISOString(), checks: last.checks }, { headers: { "cache-control": "no-store" } });
}
