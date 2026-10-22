/**
 * A unified diff, parsed into what a reader of one expects to see: each file,
 * each hunk header, and every line with its old and new line numbers.
 *
 * Used for the merged pull request in the bug chapter. The diff is the file
 * GitHub serves for the pull request, stored in `content/` unedited, so the
 * page shows the patch that was merged rather than a retelling of it.
 */

export type PatchLine = {
  /** "+" added, "-" removed, " " context, "@" hunk header. */
  mark: "+" | "-" | " " | "@";
  old: number | null;
  new: number | null;
  text: string;
};

export type PatchFile = { path: string; added: number; removed: number; lines: PatchLine[] };

export type Patch = { files: PatchFile[]; added: number; removed: number };

export function parsePatch(diff: string): Patch {
  const files: PatchFile[] = [];
  let file: PatchFile | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of diff.split("\n")) {
    if (raw.startsWith("diff --git ")) {
      file = { path: raw.replace(/^diff --git a\/(\S+) b\/\S+$/, "$1"), added: 0, removed: 0, lines: [] };
      files.push(file);
      continue;
    }
    if (!file || raw.startsWith("index ") || raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;

    const hunk = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      file.lines.push({ mark: "@", old: null, new: null, text: hunk[3].trim() });
      continue;
    }

    const mark = raw.charAt(0);
    const text = raw.slice(1);
    if (mark === "+") {
      file.lines.push({ mark: "+", old: null, new: newLine++, text });
      file.added++;
    } else if (mark === "-") {
      file.lines.push({ mark: "-", old: oldLine++, new: null, text });
      file.removed++;
    } else if (mark === " ") {
      file.lines.push({ mark: " ", old: oldLine++, new: newLine++, text });
    }
  }

  return {
    files,
    added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0),
  };
}
