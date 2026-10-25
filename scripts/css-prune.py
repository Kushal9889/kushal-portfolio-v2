"""Find dead CSS in a stylesheet layered by successive passes, and remove what is provably dead.

    python3 scripts/css-prune.py app/scenes.css            report only
    python3 scripts/css-prune.py app/scenes.css --write    also delete overridden declarations
    python3 scripts/css-prune.py app/scenes.css --write --drop-unmatched
                                                           and the unmatched selectors, once a person
                                                           has read the list and found no state among them

Two kinds of dead code, handled differently:

1. Overridden declarations (deleted with --write). A declaration is dead when a later
   rule with the same selector text, inside the same @media/@supports context, sets the
   same property: same selector means same specificity and later wins, unless the earlier
   one is !important and the later is not (then it stays). Removing it cannot change any
   computed value. A rule left
   empty is deleted with it.
2. Unmatched selectors (reported, never deleted here). Each selector, with :hover-style
   states and pseudo-elements stripped, is queried on the built page at 390, 768 and 1440,
   still and live film, reduced and full motion. A selector that matches nothing may
   still style a state the snapshot never reaches (an agent error, a streaming answer),
   so a person reads the list and deletes by hand.

Proof either way: scripts/ui-styles.py diff must stay at 0.
"""

import argparse
import os
import re
import sys

import tinycss2
from playwright.sync_api import sync_playwright

ORIGIN = os.environ.get("PRUNE_ORIGIN", "http://localhost:3002")
# States become :is(*) so ":is(:hover, :focus)" stays a valid list; pseudo-elements go.
STATES = re.compile(r"(?<!:):(?:hover|focus-visible|focus-within|focus|active|visited|target)(?![a-z-])")
PSEUDO_EL = re.compile(r"::?(?:before|after|selection|placeholder|marker|first-letter|first-line|-webkit-[a-z-]+)(?![a-z-])")


def offsets(text):
    """Line/column (1-based) to absolute offset."""
    starts = [0]
    for i, ch in enumerate(text):
        if ch == "\n":
            starts.append(i + 1)
    return lambda line, col: starts[line - 1] + col - 1


def rule_end(text, start):
    """Offset just past the closing brace of the block that opens at or after start."""
    i = text.index("{", start)
    depth = 0
    while True:
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1


def split_selectors(prelude):
    out, depth, cur = [], 0, ""
    for ch in prelude:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    out.append(cur.strip())
    return [s for s in out if s]


def walk(nodes, text, at, ctx, rules):
    for n in nodes:
        if n.type == "qualified-rule":
            start = at(n.source_line, n.source_column)
            end = rule_end(text, start)
            prelude = tinycss2.serialize(n.prelude).strip()
            decls = []
            for d in tinycss2.parse_declaration_list(n.content, skip_comments=True, skip_whitespace=True):
                if d.type == "declaration":
                    decls.append((d.lower_name, d.important))
            rules.append({"start": start, "end": end, "prelude": " ".join(prelude.split()), "ctx": ctx, "content": n.content, "decls": decls})
        elif n.type == "at-rule" and n.lower_at_keyword in ("media", "supports") and n.content is not None:
            cond = " ".join(tinycss2.serialize(n.prelude).split())
            inner = tinycss2.parse_rule_list(n.content, skip_comments=True, skip_whitespace=True)
            walk(inner, text, at, ctx + ((n.lower_at_keyword, cond),), rules)


def declaration_spans(text, rule, at):
    """Absolute (name, start, end) of each declaration in a rule, end including the semicolon."""
    spans = []
    toks = rule["content"]
    i = 0
    while i < len(toks):
        t = toks[i]
        if t.type == "ident":
            j = i + 1
            while j < len(toks) and toks[j].type in ("whitespace", "comment"):
                j += 1
            if j < len(toks) and toks[j].type == "literal" and toks[j].value == ":":
                s = at(t.source_line, t.source_column)
                k = j + 1
                while k < len(toks) and not (toks[k].type == "literal" and toks[k].value == ";"):
                    k += 1
                if k < len(toks):
                    e = at(toks[k].source_line, toks[k].source_column) + 1
                else:
                    e = text.index("}", s)
                spans.append((t.lower_value, s, e))
                i = k + 1
                continue
        i += 1
    return spans


def overridden(rules):
    """{rule index: {property: "all" | "dup"}}. "all": a later identical selector in the same
    context re-sets it, so every occurrence here is dead. "dup": set twice in this rule, so
    only the earlier occurrences are dead."""
    dead = {}
    for i, r in enumerate(rules):
        later = {}
        for r2 in rules[i + 1:]:
            if r2["prelude"] == r["prelude"] and r2["ctx"] == r["ctx"]:
                for name, imp in r2["decls"]:
                    later[name] = later.get(name, False) or imp
        marks = {}
        # An earlier !important beats a later normal declaration, so it stays.
        for name, imp in r["decls"]:
            if name in later and (later[name] or not imp):
                marks[name] = "all"
        names = [name for name, _ in r["decls"]]
        for name in names:
            if names.count(name) > 1 and name not in marks:
                marks[name] = "dup"
        if marks:
            dead[i] = marks
    return dead


def unmatched(rules):
    probe = []
    for i, r in enumerate(rules):
        media = " and ".join(c for k, c in r["ctx"] if k == "media") or None
        supports = [c for k, c in r["ctx"] if k == "supports"]
        sels = [PSEUDO_EL.sub("", STATES.sub(":is(*)", s)).strip() or "*" for s in split_selectors(r["prelude"])]
        probe.append({"i": i, "media": media, "supports": supports, "sels": sels})
    live = {p["i"]: [False] * len(p["sels"]) for p in probe}
    js = """(probe) => probe.map((p) => {
      const mediaOk = !p.media || p.media.split(' and (').length && (() => { try { return matchMedia(p.media).matches; } catch (e) { return true; } })();
      const supOk = p.supports.every((s) => { try { return CSS.supports(s); } catch (e) { return true; } });
      return p.sels.map((s) => { if (!mediaOk || !supOk) return false; try { return !!document.querySelector(s); } catch (e) { return true; } });
    })"""
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="chrome")
        for w in (390, 768, 1440):
            for motion, q in (("reduce", "?film=still"), ("no-preference", "")):
                ctx = br.new_context(viewport={"width": w, "height": 900 if w > 700 else 844},
                                     has_touch=w < 700, is_mobile=w < 700, reduced_motion=motion)
                page = ctx.new_page()
                page.goto(f"{ORIGIN}/{q}", wait_until="networkidle")
                page.wait_for_timeout(2500)
                for y in range(0, page.evaluate("document.documentElement.scrollHeight"), 700):
                    page.evaluate(f"scrollTo(0,{y})")
                    page.wait_for_timeout(80)
                page.evaluate("document.querySelectorAll('details').forEach((d) => { d.open = true; })")
                res = page.evaluate(js, probe)
                for p, hits in zip(probe, res):
                    live[p["i"]] = [a or b for a, b in zip(live[p["i"]], hits)]
                ctx.close()
        br.close()
    return {i: [s for s, ok in zip(probe[i]["sels"], v) if not ok] for i, v in live.items() if not all(v)}, live


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--skip-dom", action="store_true")
    ap.add_argument("--drop-unmatched", action="store_true")
    a = ap.parse_args()
    text = open(a.file).read()
    at = offsets(text)
    rules = []
    walk(tinycss2.parse_stylesheet(text, skip_comments=True, skip_whitespace=True), text, at, (), rules)
    dead = overridden(rules)
    n_decl = sum(len(v) for v in dead.values())  # property names, not occurrences
    print(f"{len(rules)} rules; {n_decl} overridden declarations in {len(dead)} rules")
    for i, props in sorted(dead.items()):
        line = text.count("\n", 0, rules[i]["start"]) + 1
        print(f"  L{line} {rules[i]['prelude'][:70]}: {', '.join(f'{k}({v})' for k, v in sorted(props.items()))}")
    if not a.skip_dom:
        um, live = unmatched(rules)
        print(f"\n{sum(1 for i in um if not any(live[i]))} rules match nothing; {sum(1 for i in um if any(live[i]))} have dead selectors in their list")
        for i, sels in sorted(um.items()):
            line = text.count("\n", 0, rules[i]["start"]) + 1
            tag = "RULE" if not any(live[i]) else "sel "
            print(f"  {tag} L{line}: {' | '.join(s[:80] for s in sels)}")
    edits = []  # (start, end, replacement)
    gone = set()
    if a.write and a.drop_unmatched and not a.skip_dom:
        for i, sels in um.items():
            r = rules[i]
            orig = split_selectors(text[r["start"]:text.index("{", r["start"])])
            keep = [o for o in orig if (PSEUDO_EL.sub("", STATES.sub(":is(*)", o)).strip() or "*") not in sels]
            if not keep:
                edits.append((r["start"], r["end"], ""))
                gone.add(i)
            elif len(keep) < len(orig):
                edits.append((r["start"], text.index("{", r["start"]), ",\n".join(keep) + " "))
    if a.write and (dead or edits):
        cuts = [(s, e) for s, e, rep in edits if rep == ""]
        reps = [(s, e, rep) for s, e, rep in edits if rep]
        for i, props in dead.items():
            if i in gone:
                continue
            spans = declaration_spans(text, rules[i], at)
            last = {name: (s, e) for name, s, e in spans}
            drop = [(s, e) for name, s, e in spans
                    if props.get(name) == "all" or (props.get(name) == "dup" and (s, e) != last[name])]
            if len(drop) == len(spans):
                cuts.append((rules[i]["start"], rules[i]["end"]))
            else:
                cuts += drop
        for s, e, rep in sorted(reps, reverse=True):
            text = text[:s] + rep + text[e:]
            shift = len(rep) - (e - s)
            cuts = [(cs + shift, ce + shift) if cs > s else (cs, ce) for cs, ce in cuts]
        for s, e in sorted(cuts, reverse=True):
            # take the line's leading indent and trailing newline with the cut
            ls = text.rfind("\n", 0, s) + 1
            if text[ls:s].strip() == "":
                s = ls
            le = text.find("\n", e)
            if le != -1 and text[e:le].strip() == "":
                e = le + 1
            text = text[:s] + text[e:]
        text = re.sub(r"\n{3,}", "\n\n", text)
        open(a.file, "w").write(text)
        print(f"wrote {a.file}: {len(cuts)} cuts, {len(reps)} selector lists trimmed")


if __name__ == "__main__":
    sys.exit(main())
