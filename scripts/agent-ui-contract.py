#!/usr/bin/env python3
"""Validate the source-grounded Agent UI deliverable contract."""
import json
import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "docs/agent-workspace-contract.json"
ALLOWED_STATUS = {"proposed", "built", "blocked", "deferred"}
ALLOWED_PRIORITY = {"P0", "P1", "P2"}
FIELDS = {"id", "domain", "intent", "source", "acceptance", "implementation_paths", "priority", "status", "evidence"}


def evidence_error(reference, cache):
    path, separator, pointer = reference.partition("#")
    proof = ROOT / path
    if not separator or not proof.is_file():
        return "built evidence must reference an existing JSON file and check"
    try:
        if proof not in cache:
            cache[proof] = json.loads(proof.read_text())
        data = cache[proof]
        value = data
        for key in pointer.split("."):
            value = value[key]
        if value is not True:
            return "built evidence check did not pass"
        fingerprints = data.get("source_fingerprints")
        if not isinstance(fingerprints, dict) or not fingerprints:
            return "built evidence has no source fingerprints"
        if cache.get((proof, "fingerprints")):
            return None
        for relative, expected in fingerprints.items():
            source = ROOT / relative
            if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != expected:
                return f"stale evidence: {relative} changed"
        cache[(proof, "fingerprints")] = True
    except (OSError, ValueError, KeyError, TypeError):
        return "built evidence is malformed or its check is missing"
    return None


def validate(data, check_paths=True, expected_count=60):
    errors = []
    evidence_cache = {}
    if not isinstance(data, dict) or not isinstance(data.get("deliverables"), list):
        return ["contract must be an object with a deliverables array"]
    if len(data["deliverables"]) != expected_count:
        errors.append(f"expected {expected_count} deliverables, found {len(data['deliverables'])}")
    seen = set()
    for index, item in enumerate(data["deliverables"]):
        label = f"deliverables[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{label} must be an object")
            continue
        missing = FIELDS - item.keys()
        extra = item.keys() - FIELDS
        if missing: errors.append(f"{label} missing fields: {', '.join(sorted(missing))}")
        if extra: errors.append(f"{label} has unexpected fields: {', '.join(sorted(extra))}")
        ident = item.get("id")
        if not isinstance(ident, str) or not ident.strip(): errors.append(f"{label} id is required")
        elif ident in seen: errors.append(f"duplicate id: {ident}")
        else: seen.add(ident)
        for field in ("domain", "intent", "acceptance"):
            if not isinstance(item.get(field), str) or not item[field].strip(): errors.append(f"{label} requires non-empty {field}")
        src = item.get("source")
        if not isinstance(src, dict) or not all(isinstance(src.get(k), str) and src[k].strip() for k in ("skill", "path")):
            errors.append(f"{label} requires source.skill and source.path")
        elif check_paths and not Path(src["path"]).is_file(): errors.append(f"{label} source path does not exist: {src['path']}")
        paths = item.get("implementation_paths")
        if not isinstance(paths, list) or not paths or any(not isinstance(p, str) or not p.strip() for p in paths):
            errors.append(f"{label} requires implementation_paths")
        elif check_paths:
            for path in paths:
                if not (ROOT / path).is_file(): errors.append(f"{label} implementation path does not exist: {path}")
        if item.get("priority") not in ALLOWED_PRIORITY: errors.append(f"{label} priority must be P0, P1 or P2")
        status = item.get("status")
        if status not in ALLOWED_STATUS: errors.append(f"{label} invalid status: {status}")
        evidence = item.get("evidence")
        if status == "built" and (not isinstance(evidence, str) or not evidence.strip()): errors.append(f"{label} built status requires evidence")
        elif status == "built" and check_paths:
            problem = evidence_error(evidence, evidence_cache)
            if problem: errors.append(f"{label} {problem}")
        if status != "built" and evidence not in (None, ""): errors.append(f"{label} non-built status must not claim completion evidence")
    return errors


def self_test():
    base = {"deliverables": [{"id":"X","domain":"d","intent":"i","source":{"skill":"s","path":"/present"},"acceptance":"a","implementation_paths":["x"],"priority":"P1","status":"proposed","evidence":None}]}
    assert not validate(base, check_paths=False, expected_count=1)
    dup = json.loads(json.dumps(base)); dup["deliverables"].append(dict(dup["deliverables"][0]))
    assert any("duplicate id" in e for e in validate(dup, check_paths=False, expected_count=2))
    no_accept = json.loads(json.dumps(base)); no_accept["deliverables"][0]["acceptance"] = ""
    assert any("acceptance" in e for e in validate(no_accept, check_paths=False, expected_count=1))
    built_no_evidence = json.loads(json.dumps(base)); built_no_evidence["deliverables"][0].update(status="built", evidence=None)
    assert any("built status requires evidence" in e for e in validate(built_no_evidence, check_paths=False, expected_count=1))
    proposed_with_evidence = json.loads(json.dumps(base)); proposed_with_evidence["deliverables"][0]["evidence"] = "unverified claim"
    assert any("non-built status must not claim completion evidence" in e for e in validate(proposed_with_evidence, check_paths=False, expected_count=1))
    missing_source = json.loads(json.dumps(base)); missing_source["deliverables"][0]["source"]["path"] = "/not/a/real/skill.md"
    assert any("source path does not exist" in e for e in validate(missing_source, expected_count=1))
    assert evidence_error("/missing.json#checks.X", {})
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as folder:
        proof = Path(folder) / "proof.json"
        proof.write_text(json.dumps({"checks": {"X": False}, "source_fingerprints": {"scripts/agent-ui-contract.py": "wrong"}}))
        assert "did not pass" in evidence_error(f"{proof}#checks.X", {})
        proof.write_text(json.dumps({"checks": {"X": True}, "source_fingerprints": {"scripts/agent-ui-contract.py": "wrong"}}))
        assert "stale evidence" in evidence_error(f"{proof}#checks.X", {})
    print("PASS: valid fixture accepted; duplicate ID, missing acceptance, missing built evidence, unsupported proposed evidence and missing source path rejected")


def main():
    if "--self-test" in sys.argv:
        self_test()
        return 0
    try: data = json.loads(CONTRACT.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: cannot load contract: {exc}", file=sys.stderr); return 1
    errors = validate(data)
    if errors:
        for err in errors: print(f"FAIL: {err}", file=sys.stderr)
        return 1
    pending = sorted((x for x in data["deliverables"] if x["status"] != "built"), key=lambda x: ({"P0":0,"P1":1,"P2":2}[x["priority"]], x["id"]))
    print(f"PASS: {len(data['deliverables'])} deliverables valid; {len(pending)} pending")
    for item in pending: print(f"{item['priority']} {item['id']} [{item['domain']}] {item['intent']}")
    return 0

if __name__ == "__main__": raise SystemExit(main())
