# RepositoryRealms Phase 22 — Generated Asset Manifest

Status: Runtime visual system · promoted after Phase 24 release-candidate QA
Generator: built-in ImageGen
Art-direction source of truth: `concept/repositoryrealms-visual-bible-v1.png`

## Locked art direction

- Premium hand-painted 2D medieval editorial fantasy.
- Dark forest, dark oak, limestone, parchment, aged brass, restrained burgundy and slate-blue accents.
- Calm, intelligent and collaborative workplace; never a combat-first fantasy game.
- The original visual-bible style applies to environments, characters, props and ornamental frames.
- No anime, pixel art, neon, plastic 3D, generic mobile-game gloss or excessive filigree.
- No generated text, business labels or functional icons inside raster assets.
- Functional controls, typography and accessibility semantics remain HTML/CSS/SVG.

## Assets

| Asset | Purpose | Background |
| --- | --- | --- |
| `concept/repositoryrealms-visual-bible-v1.png` | Master style, palette, materials, environment, character and frame reference | Opaque |
| `maps/realm-office-master-map-v1.png` | Top-down master castle-office map | Opaque |
| `maps/realm-environment-material-atlas-v1.png` | Eight-source material atlas for the collision-aligned runtime map | Opaque |
| `characters/realm-character-roster-v1.png` | Twelve full-body identity anchors | Opaque |
| `characters/realm-character-directions-v1.png` | Six characters in four map directions | Transparent |
| `characters/realm-character-directions-v1-chroma.png` | Reproducible chroma source | Chroma `#ff00ff` |
| `characters-v2/realm-character-directions-v2.png` | Readability-first six-character directional atlas for 55–70 px map display | Transparent |
| `characters-v2/realm-character-directions-v2-chroma.png` | Reproducible readability-first chroma source | Chroma `#ff00ff` |
| `props/realm-office-prop-atlas-v1.png` | Top-down office props | Transparent |
| `props/realm-office-prop-atlas-v1-chroma.png` | Reproducible chroma source | Chroma `#ff00ff` |
| `ui/realm-ui-ornament-atlas-v1.png` | Decorative frames, dividers, nameplates and portrait surrounds | Transparent |
| `ui/realm-ui-ornament-atlas-v1-chroma.png` | Reproducible chroma source | Chroma `#ff00ff` |
| `erp-ui/realm-erp-ui-atlas-v1.png` | ERP/CRM-specific crests, plaques, table finials, seals and ledger flourishes | Transparent |
| `erp-ui/realm-erp-ui-atlas-v1-chroma.png` | Reproducible ERP/CRM ornament source | Chroma `#ff00ff` |

## Extracted production assets

- `characters-v2/directions-v2/`: 24 transparent readability-first character sprites, six identities × four directions; largest-component extraction prevents adjacent-row bleed.
- `props/items/`: 36 transparent connected prop assets.
- `props/items-webp/`: 36 optimized transparent prop assets; runtime loads only seven selected business props (61,702 bytes).
- `ui/frames/`: 15 transparent frame and ornament assets.
- `ui/frames-webp/`: 15 optimized transparent ornaments; runtime preloads 11 selected surfaces.
- `erp-ui/elements-webp-v2/`: 12 optimized transparent medieval-enterprise ornaments extracted by named regions (117,672 bytes total).
- `maps/materials-webp/`: 8 optimized room, wall and threshold materials (433,386 bytes total).
- Every directory contains a deterministic `manifest.json` with source and crop bounds.
- Rebuild with `scripts/extract-realm-atlases.py`; the script supports PNG/WebP and refuses to overwrite existing output.

## Runtime preview

- Generated v2 characters, collision-aligned room materials, business props and UI ornaments are now the default Realm presentation. Character silhouettes are rendered at 2.3 tiles with a ground ring instead of a rectangular selection box.
- `NEXT_PUBLIC_REALM_GENERATED_ART=0` explicitly returns characters to the procedural renderer.
- `NEXT_PUBLIC_REALM_ENVIRONMENT_ART=0`, `NEXT_PUBLIC_REALM_PROP_ART=0` and `NEXT_PUBLIC_REALM_UI_ART=0` independently disable their decorative layers for incident rollback.
- Failed or incomplete art loading still returns only the affected layer to the procedural/CSS renderer.
- Environment textures are applied through the existing 58×36 `ROOMS` and `WALLS` topology; generated geometry never controls collision.
- The master map remains an art-direction source, not a clickable or collision-bearing raster background.
- Runtime identity-to-character selection is deterministic and does not store a parallel employee profile.
- Prop art is keyed by the existing `WORLD_OBJECTS[].id`; panel routing, authorization and receipts remain unchanged.
- UI raster layers use `pointer-events: none`; controls, copy, focus rings and dialog semantics stay in HTML/CSS/SVG. A failed preload returns the whole UI ornament layer to existing CSS.

### UI ornament bindings

| Surface | Generated ornament | Interaction contract |
| --- | --- | --- |
| Inspector | `frame-001.webp` | Decorative frame outside the scrollable information hierarchy |
| Quest card | `frame-004.webp` | Parchment edge behind the existing task content and controls |
| Realm action dialog | `frame-005.webp` | Modal surround; Escape, close, focus and action buttons remain native DOM controls |
| Profile portrait | `frame-006.webp` | Circular surround outside the existing initials/avatar surface |
| Notice corners | `frame-008.webp`, `frame-009.webp`, `frame-012.webp`, `frame-013.webp` | Four decorative corners; notice copy, icon and CTA remain unchanged |
| Interaction prompt | `frame-010.webp` | Carved plaque behind the existing keyboard-accessible `E` action |
| Panel heading divider | `frame-011.webp` | Decorative separator positioned inside the heading's existing margin |

### ERP/CRM ornament bindings

| ERP surface | Generated ornament | Interaction contract |
| --- | --- | --- |
| Operations hero | `erp-ui-header-crest.webp` | Low-contrast heraldic anchor behind native heading, copy and sync state |
| Section eyebrow | `erp-ui-title-plaque.webp` | Medieval title material behind semantic HTML text |
| Section divider | `erp-ui-manuscript-divider.webp` | Non-interactive manuscript flourish between heading and record content |
| Work registry table | `erp-ui-table-finials.webp` | Decorative header finials; table semantics and horizontal scrolling are unchanged |
| Profile and ledger cards | `erp-ui-card-corners.webp` | Restrained corner brackets outside the information hierarchy |
| KPI cards | `erp-ui-kpi-medallion.webp` | Subtle watermark behind numeric values |
| Sync receipt | `erp-ui-approval-seal.webp` | Visual seal beside the existing synchronization status |
| Active tab and approval state | `erp-ui-quest-ribbon.webp` | Presentation background only; native button/status content remains readable |
| ERP tab rail | `erp-ui-tab-endcaps.webp` | Non-interactive navigation endcaps |
| Ledger columns | `erp-ui-ledger-flourish.webp` | Low-opacity accounting watermark |
| Access manifest | `erp-ui-status-ornaments.webp` | Decorative session-status flourish hidden at narrow widths |
| ERP footer | `erp-ui-footer-flourish.webp` | Page-ending ornament after all business controls |

All ERP/CRM ornaments are preloaded with the existing UI-art layer, gated by `data-realm-ui-art="ready"`, use `pointer-events: none` when layered above content, and fall back to the existing CSS presentation through `NEXT_PUBLIC_REALM_UI_ART=0` or image-load failure.

### Business prop bindings

| World object | Generated prop | Meaning |
| --- | --- | --- |
| `guild-roster` | `prop-011.webp` | Open guild ledger lectern |
| `war-table` | `prop-004.webp` | Round campaign map table |
| `treasury-chest` | `prop-018.webp` | Locked royal chest |
| `tavern-board` | `prop-009.webp` | Hanging tavern notice banner |
| `quest-board` | `prop-010.webp` | Freestanding quest board |
| `arcane-forge` | `prop-002.webp` | Exchange and automation counter |
| `realm-gate` | `prop-015.webp` | Beacon lantern inside the procedural portal arch |

Interaction state is layered by code: teal frame for hover, gold corner brackets for nearby, and a gold diamond plus surface tint for the active authorized panel. The HTML interaction prompt remains the accessible action control.

## Final prompt set

### Visual bible

Create a premium coherent art-direction board for RepositoryRealms: top-down medieval guild office, inclusive office-adventurer roster, workplace props and refined medieval-enterprise UI ornament. Use deep forest, parchment, aged brass, oak and limestone. Keep it calm, productive and restrained. No text, logos, combat focus, neon, anime, pixel art, plastic 3D or watermark.

### Master map

Using the visual bible as the mandatory reference, create a complete top-down orthographic castle-office map around a 38-by-24 navigation grid. Include Great Hall, Guild Hall, Royal Treasury, Embassy, War Room, Tavern, archive, focus rooms, broad corridors and clear entrances. Preserve readable collision boundaries and connected workplace circulation. No text, characters, combat arena, fog, isometric angle, perspective distortion or watermark.

### Environment material atlas

Using the visual bible and master map only as authoritative style references, create a new exact 4×2 top-down material atlas. In row-major order render moss-green Guild slate, muted-indigo War Room flagstone, warm-ochre Treasury stone with restrained brass, burgundy Tavern oak parquet, dark-jade Great Hall flagstone, plum-charcoal Forge basalt, dark green-gray wall masonry and neutral sandstone thresholds. Keep scale and neutral diffuse lighting consistent. No objects, characters, labels, icons, perspective, watermark or empty space.

### Character roster

Using the visual bible as the mandatory character reference, create twelve diverse full-body medieval office professionals in two clean rows. Represent guild coordination, projects, scouting, finance, people care, diplomacy, records, creativity, operations, analytics, client relations and direction through practical clothing and props. Preserve consistent scale and rendering. No weapons, armor, battle poses, anime, pixel art, chibi or watermark.

### Directional characters

Using the visual bible and roster as mandatory references, translate six distinct identities into compact hand-painted top-down avatars. Show facing down, left, right and up in a regular grid at identical scale. Preserve identity and outfit across directions. Use uniform `#ff00ff` chroma with no cast shadow. No text, grid lines, weapons, anime, pixel art or watermark.

### Prop atlas

Using the visual bible as the mandatory reference, create a separated top-down atlas of practical office props: desks, chairs, meeting tables, counters, shelves, archive storage, boards, ledgers, lamps, plants, rugs, seating, tavern furniture, map table, privacy screen, supply cart, pigeon stand, hourglass, coat rack and dispatch box. Use uniform `#ff00ff` chroma. No text, weapons, pixel art, isometric view or watermark.

### UI ornament atlas

Using the visual bible as the mandatory reference, create isolated decorative frames, card surrounds, inspector and modal frames, portrait rings, notification frames, badges, nameplates, dividers, corner ornaments and toolbar surrounds. Use aged brass, forest enamel, parchment and carved oak on uniform `#ff00ff` chroma. Keep interiors empty. No text, functional icons, pixel art, excessive filigree or watermark.

### ERP/CRM ornament atlas

Using the current ERP/CRM dashboard as a palette and material reference only, create one clean 4×3 atlas containing exactly twelve non-pixel medieval-enterprise ornaments: a royal header crest, compact title plaque, illuminated-manuscript divider, table-header finials, four card corners, KPI medallion ring, wax approval seal, quest ribbon, tab endcaps, ledger flourish, status ornaments and footer flourish. Use antique gold, aged brass, deep emerald enamel, restrained parchment highlights and refined hand-painted detail on uniform `#ff00ff` chroma. Keep interiors empty and silhouettes production-ready. No text, logos, characters, weapons, crowns, pixel art, cartoon rendering, plastic 3D, neon, combat imagery, excessive filigree or watermark.

## Integration rule

These are versioned generated assets consumed by one RepositoryRealms visual system, not a parallel source of business data. Realm uses the complete generated renderer. ERP/CRM uses the same stone, wall and ornament language only as non-interactive decoration around its existing dense controls, tables and records. The default-on promotion happened only after responsive, accessibility, performance, visual-regression and Phase 24 release-candidate gates passed on `codex/realms-demo`; every Realm art layer retains an explicit `0` rollback and procedural fallback.
