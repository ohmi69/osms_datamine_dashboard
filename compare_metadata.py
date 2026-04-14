#!/usr/bin/env python3
"""
Compare two metadata archive directories and show diffs.

Usage:
    python compare_metadata.py --before <dir> --after <dir> [--type app_metadata|raw_metadata]

Examples:
    python compare_metadata.py --before metadata_archive/20260413_1628_pre-cbt --after metadata_archive/20260413_1628_pre-cbt2
    python compare_metadata.py --before metadata_archive/20260413_1628_pre-cbt --after metadata_archive/20260413_1628_pre-cbt2 --type raw_metadata
    python compare_metadata.py --before ... --after ... --file maps.json
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path


# ANSI colors
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
RESET  = "\033[0m"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_json(path: Path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        print(f"{YELLOW}Warning: could not parse JSON in {path}: {e}{RESET}", file=sys.stderr)
        return None
    except OSError as e:
        print(f"{YELLOW}Warning: could not read {path}: {e}{RESET}", file=sys.stderr)
        return None


def collect_files(root: Path) -> dict[str, Path]:
    files = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            rel = path.relative_to(root)
            files[str(rel).replace("\\", "/")] = path
    return files


def stable_hash(obj) -> str:
    return hashlib.md5(
        json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


def fmt(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, (bool, int, float)):
        return str(v)
    if isinstance(v, str):
        return repr(v)
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------------------
# Deep diff (used to show what changed inside a unit)
# ---------------------------------------------------------------------------

IDENTITY_KEYS = ("id", "name", "key", "code", "type")


def _identity_key(lst: list):
    if not lst or not all(isinstance(x, dict) for x in lst):
        return None
    for k in IDENTITY_KEYS:
        if all(k in item for item in lst):
            return k
    return None


def diff_values(path: str, before, after, out: list):
    if before == after:
        return
    if type(before) != type(after):
        out.append((path, before, after))
        return

    if isinstance(before, dict):
        for k in sorted(set(before) | set(after)):
            child = f"{path}.{k}" if path else k
            if k not in before:
                out.append((child, None, after[k]))
            elif k not in after:
                out.append((child, before[k], None))
            else:
                diff_values(child, before[k], after[k], out)

    elif isinstance(before, list):
        id_key = _identity_key(before) or _identity_key(after)
        if id_key:
            bm = {item[id_key]: item for item in before if id_key in item}
            am = {item[id_key]: item for item in after  if id_key in item}
            all_ids = list(bm) + [k for k in am if k not in bm]
            for ident in all_ids:
                child = f"{path}[{id_key}={ident}]"
                if ident not in bm:
                    out.append((child, None, am[ident]))
                elif ident not in am:
                    out.append((child, bm[ident], None))
                else:
                    diff_values(child, bm[ident], am[ident], out)
        else:
            for i, (b_item, a_item) in enumerate(zip(before, after)):
                diff_values(f"{path}[{i}]", b_item, a_item, out)
            for i in range(len(after), len(before)):
                out.append((f"{path}[{i}]", before[i], None))
            for i in range(len(before), len(after)):
                out.append((f"{path}[{i}]", None, after[i]))
    else:
        out.append((path, before, after))


def print_changes(changes: list):
    for key_path, b_val, a_val in changes:
        label = key_path if key_path else "(root)"
        if b_val is None:
            print(f"    {GREEN}+ {label}: {fmt(a_val)}{RESET}")
        elif a_val is None:
            print(f"    {RED}- {label}: {fmt(b_val)}{RESET}")
        else:
            print(f"    {YELLOW}  {label}{RESET}")
            print(f"      {RED}- {fmt(b_val)}{RESET}")
            print(f"      {GREEN}+ {fmt(a_val)}{RESET}")


# ---------------------------------------------------------------------------
# Per-file unit extractors
# Returns dict[str, any]  where the value is the object to hash/diff
# ---------------------------------------------------------------------------

def extract_beauty_coupons(data: dict) -> dict:
    units = {}
    for pool in data.get("pools", []):
        cid = pool["coupon_id"]
        for style in pool.get("styles", []):
            units[f"pool:{cid}:style:{style['id']}"] = style
    return units


def extract_cash_shop(data: dict) -> dict:
    units = {}
    for cat in data.get("categories", []):
        for item in cat.get("items", []):
            units[str(item["id"])] = item
    return units


def extract_crafting(data: dict) -> dict:
    units = {}
    for disc in data.get("disciplines", []):
        for ot in disc.get("output_types", []):
            for lvl in ot.get("levels", []):
                for recipe in lvl.get("recipes", []):
                    units[str(recipe["id"])] = recipe
    return units


def extract_items(data: dict) -> dict:
    units = {}
    for item in data.get("items", []):
        units[f"item:{item['id']}"] = item
    for scroll in data.get("scrolls", []):
        units[f"scroll:{scroll['id']}"] = scroll
    return units


def extract_lookups(data: dict) -> dict:
    units = {}
    for section in ("item_names", "npc_names", "mob_names", "map_names"):
        for k, v in data.get(section, {}).items():
            units[f"{section}:{k}"] = v
    return units


def extract_maps(data: dict) -> dict:
    units = {}
    for region in data.get("regions", []):
        for m in region.get("maps", []):
            units[str(m["id"])] = m
    return units


def extract_monsters(data: dict) -> dict:
    return {str(m["id"]): m for m in data.get("monsters", [])}


def extract_npcs(data: list) -> dict:
    return {str(n["id"]): n for n in data}


def extract_overview(data: dict) -> dict:
    return {k: v for k, v in data.get("stats", {}).items()}


def extract_quests(data: dict) -> dict:
    return {str(q["id"]): q for q in data.get("quests", [])}


def extract_skills(data: dict) -> dict:
    units = {}
    for job_key, job_list in data.items():
        if job_key == "total" or not isinstance(job_list, list):
            continue
        for job_group in job_list:
            for skill in job_group.get("skills", []):
                units[str(skill["id"])] = skill
    return units


def extract_tips(data) -> dict:
    # Whole file as one unit
    return {"tips": data}


EXTRACTORS = {
    "beauty_coupons.json": extract_beauty_coupons,
    "cash_shop.json":      extract_cash_shop,
    "crafting.json":       extract_crafting,
    "items.json":          extract_items,
    "lookups.json":        extract_lookups,
    "maps.json":           extract_maps,
    "monsters.json":       extract_monsters,
    "npcs.json":           extract_npcs,
    "overview.json":       extract_overview,
    "quests.json":         extract_quests,
    "skills.json":         extract_skills,
    "tips.json":           extract_tips,
}


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------

def compare_json_files(rel_path: str, before_path: Path, after_path: Path) -> bool:
    print(f"  {DIM}checking {rel_path}...{RESET}", end="", flush=True)

    before_data = load_json(before_path)
    after_data  = load_json(after_path)
    if before_data is None or after_data is None:
        print(f" {YELLOW}load error{RESET}")
        return False
    if before_data == after_data:
        print(f" {GREEN}ok{RESET}")
        return False

    filename = Path(rel_path).name
    extractor = EXTRACTORS.get(filename)

    if extractor is None:
        # Fallback: generic deep diff
        changes: list[tuple] = []
        diff_values("", before_data, after_data, changes)
        print(f" {YELLOW}{len(changes)} change{'s' if len(changes) != 1 else ''}{RESET}")
        print(f"\n{BOLD}{CYAN}~ {rel_path}{RESET}")
        print_changes(changes)
        return True

    before_units = extractor(before_data)
    after_units  = extractor(after_data)

    added   = [k for k in after_units  if k not in before_units]
    removed = [k for k in before_units if k not in after_units]
    changed = [
        k for k in before_units
        if k in after_units and stable_hash(before_units[k]) != stable_hash(after_units[k])
    ]

    if not added and not removed and not changed:
        print(f" {GREEN}ok{RESET}")
        return False

    total = len(added) + len(removed) + len(changed)
    print(f" {YELLOW}{total} unit{'s' if total != 1 else ''} changed{RESET}")
    print(f"\n{BOLD}{CYAN}~ {rel_path}{RESET}")

    for k in removed:
        unit = before_units[k]
        label = unit.get("name", k) if isinstance(unit, dict) else k
        print(f"  {RED}- [{k}] {label}{RESET}")

    for k in added:
        unit = after_units[k]
        label = unit.get("name", k) if isinstance(unit, dict) else k
        print(f"  {GREEN}+ [{k}] {label}{RESET}")

    for k in changed:
        b_unit = before_units[k]
        a_unit = after_units[k]

        # Scalar units (lookups values, overview stats, tips)
        if not isinstance(b_unit, (dict, list)):
            label = b_unit.get("name", k) if isinstance(b_unit, dict) else k
            print(f"  {YELLOW}~ [{k}]{RESET}")
            print(f"    {RED}- {fmt(b_unit)}{RESET}")
            print(f"    {GREEN}+ {fmt(a_unit)}{RESET}")
            continue

        # tips: whole-file unit — just say it changed
        if k == "tips":
            print(f"  {YELLOW}~ tips (file content changed){RESET}")
            continue

        name = b_unit.get("name", "") if isinstance(b_unit, dict) else ""
        print(f"  {YELLOW}~ [{k}]{' ' + repr(name) if name else ''}{RESET}")
        changes: list[tuple] = []
        diff_values("", b_unit, a_unit, changes)
        print_changes(changes)

    return True


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Compare two metadata archive snapshots.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--before", required=True, help="Path to the before snapshot directory")
    parser.add_argument("--after",  required=True, help="Path to the after snapshot directory")
    parser.add_argument(
        "--type",
        dest="meta_type",
        choices=["app_metadata", "raw_metadata"],
        default="app_metadata",
        help="Which metadata subdirectory to compare (default: app_metadata)",
    )
    parser.add_argument(
        "--file",
        default=None,
        help="Restrict comparison to a specific file or filename fragment (e.g. maps.json)",
    )
    args = parser.parse_args()

    before_root = Path(args.before) / args.meta_type
    after_root  = Path(args.after)  / args.meta_type

    for label, p in [("before", before_root), ("after", after_root)]:
        if not p.exists():
            print(f"{RED}Error: {label} path does not exist: {p}{RESET}", file=sys.stderr)
            sys.exit(1)

    before_files = collect_files(before_root)
    after_files  = collect_files(after_root)
    all_keys = sorted(set(before_files) | set(after_files))

    if args.file:
        needle = args.file.replace("\\", "/")
        all_keys = [k for k in all_keys if needle in k]
        if not all_keys:
            print(f"{YELLOW}No files matched '{args.file}'{RESET}", file=sys.stderr)
            sys.exit(1)

    print(f"{BOLD}Comparing {args.meta_type}{RESET}")
    print(f"  {DIM}before: {before_root}{RESET}")
    print(f"  {DIM}after:  {after_root}{RESET}")
    print(f"  {DIM}{len(before_files)} files before / {len(after_files)} files after{RESET}")

    added_files   = [k for k in all_keys if k not in before_files]
    removed_files = [k for k in all_keys if k not in after_files]
    common        = [k for k in all_keys if k in before_files and k in after_files]

    for rel in added_files:
        print(f"\n{GREEN}{BOLD}+ {rel}{RESET}  (new file)")
    for rel in removed_files:
        print(f"\n{RED}{BOLD}- {rel}{RESET}  (deleted)")

    changed_count = sum(
        compare_json_files(rel, before_files[rel], after_files[rel])
        for rel in common
    )

    print(f"\n{BOLD}Summary:{RESET}")
    print(f"  {GREEN}+ {len(added_files)} added{RESET}")
    print(f"  {RED}- {len(removed_files)} removed{RESET}")
    print(f"  {YELLOW}~ {changed_count} modified{RESET}")
    print(f"  {DIM}  {len(common) - changed_count} unchanged{RESET}")


if __name__ == "__main__":
    main()
