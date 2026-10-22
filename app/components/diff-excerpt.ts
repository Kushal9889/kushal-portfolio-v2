/**
 * The defect as a shortened reading of `CompositeBackend.ls()`, shared by the
 * classic page's reveal and the stage's bug chapter. Kept apart from either
 * component so importing the lines does not import a component's stylesheet.
 * The patch as merged is `content/pr-4925.diff`.
 */

export const BEFORE = [
  { text: "results = []", tone: "plain" },
  { text: "for route in self.routes:", tone: "plain" },
  { text: "    results.extend(route_result.entries or [])", tone: "plain" },
  { text: "", tone: "plain" },
  { text: "default_result = self.default.ls(path)", tone: "plain" },
  { text: "results.extend(default_result.entries or [])", tone: "bad" },
  { text: "return ListResult(entries=results)", tone: "plain" },
] as const;

export const AFTER = [
  { text: "default_result = self.default.ls(path)", tone: "plain" },
  { text: "if default_result.error:", tone: "good" },
  { text: "    return ListResult(error=default_result.error)", tone: "good" },
  { text: "results.extend(default_result.entries or [])", tone: "plain" },
] as const;
