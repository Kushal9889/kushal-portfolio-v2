import type { Metadata } from "next";
import { loadContent, section } from "@/lib/content";
import { TARGETS } from "@/lib/agent/tools";
import evals from "@/content/evals.json";
import models from "@/content/models.json";
import Lab from "./Lab";

export const metadata: Metadata = {
  title: "Lab",
  robots: { index: false, follow: false },
};

/** Isolated prototypes for the stage systems. Every value is read from the corpus. */
export default function LabPage() {
  const { profile } = loadContent();
  const cut = profile.tagline.indexOf(". ");
  const os = section("Open source, LangChain deepagents");
  const hours = os.metrics.find((m) => /hour/i.test(m.value));
  const merged = os.artifacts.find((a) => a.state === "merged");

  return (
    <Lab
      name={profile.name}
      agent={{
        email: profile.email,
        linkedin: profile.linkedin,
        site: profile.site.replace("https://", ""),
        openable: [...TARGETS.entries()].map(([key, v]) => ({ key, label: v.label, url: v.url, about: v.about })),
      }}
      hero={{
        headline: cut === -1 ? profile.tagline : profile.tagline.slice(0, cut + 1),
        qualifier: cut === -1 ? "" : profile.tagline.slice(cut + 2),
        current: profile.current,
        available: profile.available,
      }}
      bug={{
        figure: hours?.value.replace(/\s*hours?$/i, "") ?? "",
        unit: hours ? `hours ${hours.label}` : "",
        sentence: profile.proof,
        href: merged?.url ?? profile.github,
        label: merged?.label ?? "",
      }}
      evals={{
        cases: evals.cases,
        passed: evals.passed,
        runs: evals.runs,
        totalRuns: evals.totalRuns,
        totalPasses: evals.totalPasses,
        precision1: evals.retrieval.precision1,
        scored: evals.retrieval.scored,
        mrr: evals.retrieval.mrr,
        p95: evals.p95,
        groups: Object.entries(evals.groups).map(([name, g]) => ({ name, cases: g.cases, passed: g.passed })),
        detail: evals.cases_detail.map((c) => ({ name: c.name, pass: c.pass })),
      }}
      model={{ chosen: models.chosen, chosenOn: models.chosenOn, observations: models.observations }}
    />
  );
}
