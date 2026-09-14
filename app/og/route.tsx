import { ImageResponse } from "next/og";
import { loadContent } from "@/lib/content";
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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f7f5ef",
          color: "#2b2621",
          padding: "64px 76px",
        }}
      >
        {/* His name, the way the page sets it.
         *
         * This asked for `monospace` and never got it: Satori ships no font by
         * name, so every glyph on this card has always rendered in the default
         * sans while the code claimed a face it could not load. The card is the
         * only thing most people see before they decide whether to open the
         * link, so it now says what it is actually doing, and the name is set
         * at a size that survives a 200-pixel thumbnail. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1 }}>{profile.name}</span>
          <span style={{ fontSize: 30, color: "#7a7269" }}>{profile.location}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {question ? (
            <>
              <div style={{ fontSize: 34, color: "#7a7269" }}>Someone asked his site</div>
              <div style={{ fontSize: 56, lineHeight: 1.15, maxWidth: 1000 }}>
                {question.endsWith("?") ? question : `${question}?`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 62, lineHeight: 1.12, maxWidth: 980 }}>{profile.tagline}</div>
          )}

          {/* The graph, drawn as the graph.
           *
           * Separators are drawn rather than typed, because Satori falls back to
           * tofu for glyphs its bundled font lacks and an arrow is exactly the
           * kind of character that goes missing on a card seen only by
           * strangers. Two 30x3 bars between three words is also what an em dash
           * looks like at thumbnail size, on a page whose prose gate is that
           * there are none.
           *
           * So the row is the same three nodes on a rail the favicon draws and
           * the hero runs: one mark, three places, no new vocabulary. */}
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {["route", "retrieve", "answer"].map((node, i) => (
              <div
                key={node}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  width: 200,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                  <div
                    style={{
                      width: "100%",
                      height: 3,
                      background: i === 0 ? "transparent" : "#c4441f",
                    }}
                  />
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 9,
                      background: "#c4441f",
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      width: "100%",
                      height: 3,
                      background: i === 2 ? "transparent" : "#c4441f",
                    }}
                  />
                </div>
                <span style={{ fontSize: 28, color: "#7a7269" }}>{node}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Two items, not three. A thumbnail has room for one strong claim and
            the address it lives at, and the third row was what pushed the type
            down to a size that stopped reading. */}
        {/* The proof and the address, on lanes that cannot collide.
         *
         * Both were `space-between` with no width on either, so the proof wrapped
         * to three lines and ran straight through the domain sitting beside it.
         * On the card most people see before they see the site. The proof takes
         * a measure and the address refuses to shrink. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48, fontSize: 30 }}>
          <span style={{ maxWidth: 700, lineHeight: 1.3 }}>
            {question
              ? `${evals.passed}/${evals.cases} eval assertions pass, answered live`
              : profile.proof}
          </span>
          <span style={{ color: "#7a7269", flexShrink: 0 }}>{profile.site.replace("https://", "")}</span>
        </div>
      </div>
    ),
    { ...size, headers },
  );
}
