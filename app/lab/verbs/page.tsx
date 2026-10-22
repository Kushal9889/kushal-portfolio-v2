import type { Metadata } from "next";
import { loadContent, section, loadCertifications, progress } from "@/lib/content";
import evals from "@/content/evals.json";
import { BEFORE } from "@/app/components/diff-excerpt";
import VerbBench from "./VerbBench";

export const metadata: Metadata = {
  title: "Lab, verbs",
  robots: { index: false, follow: false },
};

/**
 * Phase 1 bench: all eight motion verbs on real corpus values, each playable,
 * each with its reduced motion form. Nothing on this page is typed in; every
 * figure is read from content/ the same way the stage reads it.
 */
export default function VerbsLabPage() {
  const { profile } = loadContent();
  const os = section("Open source, LangChain deepagents");
  const hours = os.metrics.find((m) => /hour/i.test(m.value));
  const questrom = section("Boston University, Questrom Computational Lab");
  const img = section("IMG Systems");
  const schema = img.metrics.find((m) => /schema/i.test(m.label));
  const certs = loadCertifications();
  const exam = certs.find((c) => c.kind === "proctored-exam");
  const program = certs.find((c) => c.components);
  const done = program ? progress(program) : null;

  return (
    <VerbBench
      condense={{ title: questrom.title }}
      settle={{
        hours: hours?.value.replace(/\s*hours?$/i, "") ?? "",
        hoursLabel: hours ? `hours ${hours.label}` : "",
        schema: schema?.value ?? "",
        schemaBefore: schema?.label.match(/from ([\d-]+%)/)?.[1] ?? "",
        schemaLabel: schema?.label ?? "",
        runs: `${evals.totalPasses}/${evals.totalRuns}`,
      }}
      pulse={{ available: profile.available }}
      stamp={{
        name: exam?.name ?? "",
        issuer: exam ? `${exam.issuer}, ${exam.year}` : "",
        earned: done?.earned ?? 0,
        total: done?.total ?? 0,
      }}
      print={{ lines: BEFORE.map((l) => l.text), machine: "retrieve: langchain-ai/deepagents#4846", sentence: profile.proof }}
      dock={{
        cases: evals.cases_detail.map((c) => ({
          name: c.name,
          runs: c.runs,
          passes: Math.round(c.passRate * c.runs),
        })),
      }}
    />
  );
}
