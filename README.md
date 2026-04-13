# OSMS Extractor

A data extraction and visualization pipeline for **MapleStory Classic World**.
Reads proprietary `.wz` game archives and produces a fully static, interactive web viewer.

---

## Pipeline Overview

```
MapleStory Data/          (game install)
      │
      ▼
[1] extract_wz.py         flatten .wz files into extractor/wz_files/
      │
      ▼
[2] wz_image_extractor.py decode binary canvas data → PNG sprites
      │
      ▼
[3] parse_wz.py           parse JSON metadata → data/*.json + data/images/
      │
      ▼
[4] index.html + JS       static web viewer, served locally or deployed
```

---

## Stage 1 — Flatten WZ Files

`extractor/extract_wz.py` walks the game's `Data/` directory and copies `.wz` files
into a flat structure under `extractor/wz_files/`, separating metadata from assets.

**Output layout:**
```
extractor/wz_files/
  Mob.metadata.wz          # name/stat metadata
  Mob.canvas.wz            # raw image assets
  Map.Obj.Map.metadata.wz  # nested dirs become dot-separated prefixes
  ...
```

```bash
python extractor/extract_wz.py \
  --data-dir "D:/MapleStoryCW/appdata/Data" \
  --output-dir extractor/wz_files
```

| Flag | Default | Description |
|------|---------|-------------|
| `--data-dir` | *(required)* | Path to the game `Data/` directory |
| `--output-dir` | `extractor/wz_files` | Destination for flattened `.wz` files |

---

## Stage 2 — Extract Images

`extractor/image_extractor/wz_image_extractor.py` decodes binary canvas pixel data
from `.wz` asset files into PNG sprites. Supports pixel formats BGRA4444, BGRA8888,
BGR565, DXT3, DXT5, and format 517. Requires [Pillow](https://pillow.readthedocs.io/)
and [cryptography](https://cryptography.io/).

**Install dependencies:**
```bash
pip install -r extractor/image_extractor/requirements.txt
```

**Run against a single asset file:**
```bash
python extractor/image_extractor/wz_image_extractor.py \
  extractor/wz_files/Mob.canvas.wz \
  -o extractor/extracted/assets/Mob \
  --iv auto
```

**Options:**
```
input.wz              WZ file to extract
-o OUTPUT_DIR         Output directory (default: ./output)
--iv gms|ems|bms|auto IV key variant to use for decryption (default: auto)
--json                Also emit raw JSON node trees alongside PNGs
```

**Output structure per `.wz` file:**
```
output_dir/
  0000003.img/
    move/0.png
    move/1.png
    hit1/0.png
    die1/0.png
  0000007.img/
    ...
```

---

## Stage 3 — Parse to JSON

`extractor/parse_wz.py` reads the extracted WZ JSON metadata and assembled image
assets, then produces denormalized, human-readable JSON files consumed by the viewer.

```bash
python extractor/parse_wz.py \
  --extracted-dir extractor/extracted \
  --output-dir data
```

| Flag | Default | Description |
|------|---------|-------------|
| `--extracted-dir` | `extractor/extracted` | Directory produced by stages 1–2 |
| `--output-dir` | `data` | Where to write JSON and images |

**Outputs:**

| File | Contents |
|------|----------|
| `data/monsters.json` | Stats, elements, boss flags, spawn maps, image paths |
| `data/maps.json` | Maps grouped by region with NPC lists and spawn rates |
| `data/skills.json` | Skills by job class with per-level stat tables |
| `data/crafting.json` | Recipes by discipline (Smithing, Tailoring, Arcforge, …) |
| `data/items.json` | Equipment, consumables, scrolls, setup items |
| `data/quests.json` | Quest chains with requirements, rewards, repeat flags |
| `data/cash_shop.json` | NX-paid items, pets, coupons |
| `data/npcs.json` | NPC names and map locations |
| `data/lookups.json` | Flat `id → name` tables for fast resolution |
| `data/overview.json` | Aggregate stats (counts, boss list, CBT dates) |
| `data/images/` | PNG/WEBP sprites (monsters, items, skills, maps) |

---

## Stage 4 — Web Viewer

A vanilla JavaScript SPA with no build step. Load `index.html` over any HTTP server.

**Serve locally:**
```bash
python -m http.server 8000
# Open http://localhost:8000
```

**Tabs:**

| Tab | Description |
|-----|-------------|
| Overview | Hero banner, aggregate stats, boss roster |
| Monsters | Searchable table, animated GIFs, element resistances |
| Maps | Region browser, NPC and mob spawn lists |
| Skills | Per-job-class skill cards with expandable level tables |
| Crafting | Recipes by discipline with ingredient tooltips |
| Items | Searchable item list with type filters |
| Equipment | Armor and weapon browser |
| Cash Shop | NX item gallery |
| Quests | Quest chains, requirements, rewards, repeat flags |

**Features:** dark/light theme toggle, ID visibility toggle, hash-based URL routing
(`#monsters`, `#skills`, …), image lightbox, localStorage-persisted state.

---

## Deploy to Dashboard

`deploy.ps1` mirrors the viewer (excluding the extractor and dev files) to a separate
GitHub repo and pushes a timestamped commit.

```powershell
.\deploy.ps1
```

The destination repo is hardcoded in `deploy.ps1`:
```
C:\Users\brian\Documents\GitHub\osms_datamine_dashboard
```

Excluded from sync: `.git/`, `.claude/`, `__pycache__/`, `extractor/`, `deploy.ps1`, `.gitignore`.

---

## Repository Layout

```
osms_extractor/
├── extractor/
│   ├── extract_wz.py           Stage 1: flatten game Data/ into wz_files/
│   ├── parse_wz.py             Stage 3: parse JSON metadata → data/
│   ├── wz_files/               Stage 1 output (gitignored)
│   ├── extracted/              Stage 2 output (gitignored)
│   │   ├── metadata/           WZ JSON files
│   │   └── assets/             Decoded image directories
│   └── image_extractor/
│       ├── wz_image_extractor.py  Stage 2: decode WZ canvas → PNG
│       ├── wz_parser.py           Low-level WZ binary parser
│       └── requirements.txt       Pillow, cryptography
├── data/                       Stage 3 output — JSON + images (committed)
├── tabs/                       JS renderers, one per viewer tab
├── lib/
│   ├── config.js               Tab definitions and icons
│   ├── data.js                 JSON loading and caching
│   └── utils.js                DOM helpers, thumbnail builder, lightbox
├── styles/                     CSS per tab + base theme
├── main.js                     App entry point, routing, theme, state
├── index.html                  HTML shell
└── deploy.ps1                  Sync + push to dashboard repo
```
