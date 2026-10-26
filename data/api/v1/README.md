# OSMS Data Explorer: public dataset (v1)

Game data for MapleStory Classic World, extracted from the game client's WZ files.
This is an unofficial dataset and is not affiliated with Nexon.

| | |
| --- | --- |
| Client build | `53df5677d932a32ee84e6fcafc038dbfb8f35c91` |
| Data last modified | 2026-10-26T16:46:04Z (UTC) |

These match `client_build` and `data_updated_at` in `meta.json`, which also has
a hash and modified time for each file.

## License

Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see
`LICENSE`): use it for anything, including commercially, as long as you credit it:

> Data from OSMS Data Explorer (https://osmsdataexplorer.com), CC BY 4.0

Game content (names, text, stats, images) is © Nexon and is not covered by
this license.

Base URL: `https://osmsdataexplorer.com/data/api/v1/`

Every file can be fetched directly. GitHub Pages allows cross-origin requests, so
`fetch()` from another site works.

## Conventions

- Each entity file is a JSON array of records sorted by `id`.
- IDs are integers. Records refer to each other by ID (`item_id`, `mob_id`,
  `map_id`, `npc_id`, `skill_id`, `quest_id`), never by name.
- A field that has no value is left out rather than set to `null`.
- `stats`, `spec` and skill `levels` keep the client's own WZ key names
  (`incPAD`, `PADamage`, `mpCon`, `damage`, ...), the same names used
  by other MapleStory tools.
- Classes are names, not job masks: `Beginner`, `Warrior`, `Magician`,
  `Bowman`, `Thief`. A record with no `classes` / `req_classes` applies to every
  class. Towns are names too (`"town": "Henesys"`).
- `*_url` fields are absolute URLs to images on this site.
- `meta.json` gives the schema version, the client build the data came from,
  and for each file its `sha256`, `bytes`, `records` and `updated_at`.
  `updated_at` only changes when the file's contents change, so to stay current,
  fetch `meta.json` and download only the files whose `sha256` differs from the
  copy you have. `data_updated_at` is the newest of those times. Field changes
  that break existing code ship as `v2/`; `v1/` keeps its shape.

## Files

| File | Contents |
| --- | --- |
| `meta.json` | `schema_version`, `client_build`, `data_updated_at`, `files` (per-file `sha256`, `bytes`, `records`, `updated_at`) |
| `items.json` | Equipment, consumables, etc, setup items and scrolls |
| `monsters.json` | Monsters and where they spawn |
| `maps.json` | Maps, portals, NPC and monster placements |
| `npcs.json` | NPCs and the maps they stand in |
| `quests.json` | Quests, requirements and rewards |
| `quest_chains.json` | Quest lines in order |
| `skills.json` | Job skills with per-level values, and the crafting disciplines |
| `recipes.json` | Crafting recipes |
| `cash_shop.json` | Cash Shop listings |
| `beauty.json` | Hair and face styles |

### items.json

`id`, `name`, `category` (Equipment, Consumable, Etc, Setup), `sub_category`
(Hat, Weapon, Top, ..., Scroll), `description`, `price` (NPC sell price),
`gender`, `req_classes` (classes that can equip it; left out when any class can),
`stats` (WZ `info` values such as `reqLevel`, `incPAD`, `tuc`, `slotMax`),
`spec` (consumable effect: `hp`, `mp`, `time`, ...),
`weapon` (`type`, `after_image`, `swing_reach_px`, `stab_reach_px`),
`scroll` (`slot`, `stat`, `tier`, `success_rate`, `destroy_rate`, and `stats`:
what a successful scroll adds, e.g. `{"incACC": 1}`), `icon_url`, `sprite_urls`.

### monsters.json

`id`, `name`, `level`, `hp`, `mp`, `exp`, `is_boss`, `undead`, `passive`,
`aggro`, `invincible`, `hp_recovery`, `mp_recovery`, `stagger`,
`stats` (`PADamage`, `PDDamage`, `MADamage`, `MDDamage`, `acc`, `eva`, `speed`,
`pushed`), `elements` (element: `Weak` / `Strong` / `Immune`), `attacks`,
`skills` (`id`, `level`, `kind`, values), `spawns` (`map_id`, `count`,
`mob_time`), `revives_into` (`mob_id`, `count`), `icon_url`, `animation_urls`.

Drop tables are decided by the game server and are not in the client, so they
are not included.

### maps.json

`id`, `name`, `street_name`, `region`, `is_town`, `return_map_id`, `bgm`,
`map_mark`, `mob_capacity`, `mob_rate`, `exits` (map ids), `portals` (`name`,
`type`, `x`, `y`, `dest_map_id`, `dest_portal`), `npcs` (`npc_id`, `x`, `y`),
`mobs` (`mob_id`, `x`, `y`), `minimap_url`, `render_url`, `map_mark_url`.

### npcs.json

`id`, `name`, `maps` (map ids), `icon_url`.

### quests.json

`id`, `name`, `region`, `area`, `npc_id` (quest giver), `level_min`, `chain`,
`next_quest_id`, `description`, `repeat` (`daily`, `weekly`, `repeatable`),
`rotation`, `requirements`, `rewards`, `reward_choices`, `reward_random`,
`start_items`.

`reward_choices` (pick one) and `reward_random` (one item drawn at random) hold
`groups`. Each group has `items` (`id`, `count`, and for random rewards a
`weight`; an item's chance is its weight divided by the group's total weight)
and `classes` when the group is only for certain classes.

`requirements` and `rewards` are lists of records tagged by `type`:

| `type` | Fields |
| --- | --- |
| `mob` | `id` (mob), `count` |
| `item` | `id` (item), `count`; rewards may also have `guaranteed`, `prop` (-1 = one of the `reward_choices`; a positive number = its weight in `reward_random`), `classes`, `gender` (left out when either gender gets it) |
| `quest` | `id` (quest), `state` (2 = completed) |
| `skill` | `id` (skill), `level`, `level_condition` |
| `citizenship` | `town`, `grade` |
| `exp`, `money` | `value` |
| `citizenship_contribution` | `town`, and either `amount` or `by_grade` (amount for each grade, starting at grade 1) |

### quest_chains.json

`name` (matches a quest's `chain`), `quest_ids` (in order), `level_min`.

### skills.json

`id`, `name`, `job_id` (WZ job number: 100 Warrior, 110 Fighter, ...),
`class_name`, `job_tier`, `max_level`, `passive`, `target`, `mechanics`,
`required_skills` (`skill_id`, `level`), `description`, `levels`,
`level_descriptions`, `icon_url`.

`levels` has one object per skill level with the client's numbers for that
level, such as `mpCon`, `damage`, `mad`, `mobCount`, `attackCount`, `time`,
`prop`, `x` and `y`. Hitbox vectors (`lt`/`rb`) are not included.
`level_descriptions` is the client's text for each level.

The crafting disciplines (Smithing, Weaponcrafting, ...) are included with
`job_tier` `Crafting`, so `recipes.discipline_skill_id` and quest skill
requirements resolve. They carry only `id`, `name`, `job_id` and `max_level`.

### recipes.json

`id`, `discipline`, `discipline_skill_id`, `output_item_id`, `output_count`,
`req_skill_level`, `craft_exp`, `meso_cost`, `ingredients` (`item_id`, `count`).

### cash_shop.json

`item_id`, `name`, `category`, `sub_category`, `price` (NX; left out when the
game data sets no price, which is most items), `count`,
`period_days`, `life`, `limited_life`, `description`, `icon_url`.

### beauty.json

`id`, `type` (`hair` or `face`), `name`, `gender`, `icon_url`.

## Units and codes

| Field | Meaning |
| --- | --- |
| item `spec.time` | Buff duration in **milliseconds** (600000 = 10 min) |
| skill `levels[].time`, `cooltime`, `dotTime`, `dotInterval` | **Seconds** |
| monster `stagger` | Milliseconds the monster can't move, turn or attack after being hit (length of its hit animation) |
| monster `spawns[].mob_time`, map `mob_rate` | Raw WZ values. The client never reads them; respawn timing is decided by the server |
| map `portals`, `npcs`, `mobs`: `x`, `y` | Map coordinates in pixels, relative to the map's origin (not the image corner; y grows downward) |
| map `portals[].type` | The client's raw portal type code, not decoded |
| item `stats.attackSpeed` | Lower is faster: 2-3 Faster, 4-5 Fast, 6 Normal, 7-8 Slow, 9 Slower |
| cash shop `period_days` | Days until the item expires; 0 = permanent |
| cash shop `life` / `limited_life` | Pet lifespan in days / pet active time in seconds |
| `gender` | `"male"` or `"female"`; left out when either can use it |
| monster `elements` | Element name to `Weak`, `Strong` or `Immune` |

## Stat key glossary

These keys are the client's own names, kept as-is.

**Equipment** (`items[].stats`):
`reqLevel`, `reqSTR`, `reqDEX`, `reqINT`, `reqLUK` level and stat requirements ·
`reqPOP` fame requirement · `incSTR`, `incDEX`, `incINT`, `incLUK` stat bonuses ·
`incPAD` attack · `incMAD` magic attack · `incPDD` weapon defense ·
`incMDD` magic defense · `incACC` accuracy · `incEVA` avoidability ·
`incMHP`, `incMMP` max HP / MP · `incSpeed`, `incJump` speed / jump ·
`incCRT` critical rate % · `incCRD` critical damage % · `knockback` knockback
chance % · `tuc` upgrade slots · `attackSpeed` see above.

**Other items** (`items[].stats`): `slotMax` stack size · `unitPrice` recharge
price per unit · `tradeBlock` untradeable · `only` limit one · `notSale` can't be
sold to shops · `timeLimited` expires · `quest` quest item · `useCooldown` seconds.

**Consumable effects** (`items[].spec`): `hp`, `mp` flat restore · `hpR`, `mpR`
percent restore · `pad`, `mad`, `pdd`, `acc`, `eva`, `speed` temporary bonus ·
`time` duration in ms.

**Monsters** (`monsters[].stats`): `PADamage` attack · `MADamage` magic attack ·
`PDDamage` weapon defense · `MDDamage` magic defense · `acc` accuracy ·
`eva` avoidability · `speed` movement speed modifier (negative is slower) ·
`pushed` damage a single hit must deal to knock the monster back.

**Skills** (`skills[].levels[]`): `mpCon`, `hpCon` MP / HP cost · `damage`
damage % · `mad` magic attack (magic skills) · `fixdamage` fixed damage ·
`mobCount` max targets · `attackCount` hits per target · `bulletCount`
projectiles · `prop` chance % · `time` duration (s) · `cooltime` cooldown (s) ·
`range` range bonus (px) · `mastery` mastery level · `dot`, `dotTime`,
`dotInterval` damage over time (%, s, s) · `indiePad`, `indieMad`, `indiePdd`,
`indieMdd`, `indieAcc`, `indieEva`, `indieSpeed`, `indieJump` flat buffs ·
`indiePddR` weapon defense % · `mhpR`, `mmpR` max HP / MP % · `accX`, `evaX`,
`crtX`, `crdX` accuracy, avoidability, critical rate %, critical damage % ·
`itemCon`, `itemConNo` item id and count consumed. `x`, `y`, `z` mean something
different for each skill; `level_descriptions` says what.

## Known limitations

- **Not in the client:** drop tables, NPC shops, and spawn timing are decided by
  the game server, so they aren't here.
- **References can point outside the dataset.** A few map IDs (portal
  destinations, return maps) and quest prerequisites point to maps and quests
  that don't exist anywhere in the client, likely cut or server-only content.
  Treat a missing ID as "unknown", not as an error.
- **Monsters can share a name.** Some monsters exist under more than one ID with
  the same name and stats (e.g. a boss copy used by a specific map or event).
  Each ID is its own record; maps place monsters by ID.
- **Crafting levels:** the crafting skills say `max_level: 10` because that is
  what the game data says, but the current client caps crafting at level 8.
  Recipes with `req_skill_level` 9 or 10 are in the data but can't be reached
  in the current game.
- **Prices:** most Cash Shop items have no `price` because the game data sets
  none. Item `price` is the NPC sell price.
