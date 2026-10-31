import { ImageResponse } from "next/og";
import { loadContent, section } from "@/lib/content";
import evals from "@/content/evals.json";

export const runtime = "nodejs";

/**
 * Share card, generated from content/facts.md, optionally carrying a question.
 *
 * Two things were wrong with the static card this replaces. The type was set at
 * 24 and 22 pixels inside a 1200x630 canvas, which survives a full-size preview
 * and dissolves in the 200-pixel-wide thumbnail a chat client actually renders.
 * And a link shared from the agent carries `?q=`, so the most interesting thing
 * about that link -- the question someone thought was worth asking -- was thrown
 * away at exactly the moment it would have earned the click.
 *
 * Colours are written literally because this renders in Satori, which has no
 * access to the stylesheet and does not resolve custom properties. They match
 * the tokens in globals.css.
 */
export const size = { width: 1200, height: 630 };

export async function GET(request: Request) {
  const { profile } = loadContent();
  const raw = new URL(request.url).searchParams.get("q");
  // Bounded before it is drawn. An unbounded string here is a stranger choosing
  // how much text renders on an image served from his domain.
  const question = raw ? raw.slice(0, 120).trim() : null;

  /**
   * Cached hard, because the first request is the one that matters.
   *
   * Rendering a 1200x630 PNG through Satori on a cold serverless function is
   * slow enough to time out, and a crawler that gets a 502 does not come back:
   * it caches the absence, and the link renders bare in the thread it was
   * shared into. The card for a given question never changes, so nothing is
   * lost by letting the CDN answer every request after the first.
   */
  const headers = {
    "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
  };

  // The same title and start date the hero opens with, read from the corpus.
  const lead = section("Boston University, Questrom Computational Lab, backend");
  const role = `${lead.roleParts.title}, ${lead.title.replace(/, backend$/, "")}`;
  const start = profile.available.split(",")[0];

  // The page's dark scene, written out: Satori cannot read custom properties.
  const ground = "#0b0c0f";
  const ink = "#f2f3f5";
  const cream = "#f6eedd";
  const soft = "#b9b4ab";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: ground,
          color: ink,
          padding: "64px 76px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1, color: cream }}>{profile.name}</span>
          <span style={{ fontSize: 30, color: soft }}>{profile.location}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {question ? (
            <>
              <div style={{ fontSize: 34, color: soft }}>Someone asked his site</div>
              <div style={{ fontSize: 56, lineHeight: 1.15, maxWidth: 1000 }}>
                {question.endsWith("?") ? question : `${question}?`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 1040 }}>{profile.tagline}</div>
          )}
          <div style={{ fontSize: 30, lineHeight: 1.3, color: cream, maxWidth: 1040 }}>{role}</div>
          {start && <div style={{ fontSize: 30, color: cream }}>{`Full-time from ${start}`}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48, fontSize: 28, color: soft }}>
          <span style={{ maxWidth: 760, lineHeight: 1.3 }}>
            {question
              ? `${evals.passed} of ${evals.cases} eval cases pass on every run, answered live`
              : profile.proof}
          </span>
          <span style={{ flexShrink: 0 }}>{profile.site.replace("https://", "")}</span>
        </div>
      </div>
    ),
    { ...size, headers },
  );
}
