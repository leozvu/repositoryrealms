# Realm AAA Spatial Coworking Rebuild Plan

Status: `IMPLEMENTED_CANDIDATE__RELEASE_GATE_FAILED`

Working branch: `ux-ui-rehab`

Last updated: 2026-08-17

Next executable milestone: `Phase 10 remediation - authored character/environment production and real multi-user soak`

## 1. Source-of-truth contract

This document is the implementation source of truth for rebuilding `/realm-demo` into a believable medieval-fantasy spatial coworking product.

Every future implementation turn must:

1. Read this document before changing Realm world code.
2. Preserve every business capability, authorization rule, receipt, audit event and data meaning already connected to Realm.
3. Update the phase status and evidence sections in this document when a gate is passed.
4. Refuse to expand to the next phase while the current phase has a failed exit gate.
5. Record any change to renderer, presence ownership, business semantics or release scope as an explicit decision in the Decision Log.

This plan supersedes the visual-runtime direction in `PHASE-22-UX-JOURNEY.md` and the earlier non-RPG visual guidance for the `/realm-demo` spatial world. It does not supersede their business invariants, safety controls, accessibility requirements, authorization boundaries, receipt rules or ERP fallback contracts.

AAA is a quality benchmark for continuity, feedback, readability, responsiveness and cohesion. It is not a claim that this web product will reproduce the asset volume or production budget of a console AAA game.

## 2. Product north star

Realm is a digital workplace where work, people, voice and recognition exist in one spatial world.

The world must make these moments feel natural:

- see who is present and whether they are available;
- walk to a teammate and begin spatial voice without opening a directory first;
- approach a meaningful object and understand its business action;
- complete a short work action without leaving the world;
- enter the full ERP workspace only when deeper work is required;
- receive Gold only after a canonical business receipt;
- see the character and world respond to that recognized contribution;
- return to the exact spatial context after deep work.

The experience must feel medieval-fantasy through characters, materials, spatial rituals, sound and environmental storytelling. Business language must remain clear and operational. Fantasy terminology may frame an action, but must never obscure what the action does.

## 3. Non-negotiable product rules

### 3.1 Preserve business truth

- Realm remains a presentation and collaboration layer over RepositoryRealms.
- No fake success, fake coworker, fake voice participant, fake reward or fake receipt.
- A visual completion state appears only after the canonical action succeeds.
- Proposal, authorization, approval, execution, receipt and audit remain distinct.
- Gold remains append-only, source-bound and auditable.
- Payroll, legal rights, approvals and permissions are never gamified into ambiguous actions.
- The original ERP route remains available as a direct, reliable fallback.

### 3.2 Replace the current visual architecture

The following patterns are prohibited in the rebuilt world:

- a single background image carrying the entire environment;
- permanent rectangular hotspot labels over every object;
- character movement implemented through React `top` and `left` updates;
- one static character image per direction rocked or bobbed to simulate locomotion;
- opening a generic ERP side panel as the primary response to every object;
- contradictory presence counts between world, roster and voice;
- offscreen world buttons remaining keyboard-focusable on mobile;
- ambient animation consisting only of glow, opacity and dust overlays;
- Remotion Players used as the continuous world or locomotion engine.

### 3.3 Easier to operate wins

- The fastest safe business path must remain available.
- Direct travel remains as an accessibility and productivity fallback.
- Users can skip nonessential traversal and cinematics.
- Game feel must not add extra confirmation steps to routine, reversible actions.
- Consequential actions retain explicit confirmation and authorization.
- Reduced-motion mode keeps all business functionality.

## 4. Audit baseline to beat

The 2026-08-11 audit produced a `NO-GO` verdict and an overall benchmark score of `2.9/10`.

| Dimension | Baseline | Vertical-slice gate | Release target |
| --- | ---: | ---: | ---: |
| Art direction | 4.0 | 7.0 | 8.0 |
| World cohesion | 2.0 | 7.0 | 8.0 |
| Character quality | 1.5 | 7.0 | 8.0 |
| Animation and motion | 1.5 | 7.0 | 8.0 |
| Interaction and game feel | 2.0 | 7.0 | 8.0 |
| Spatial and social presence | 1.0 | 7.0 | 8.0 |
| HUD and readability | 3.5 | 7.0 | 8.0 |
| Coworking utility | 5.0 | 7.5 | 8.5 |
| Mobile | 2.5 | 6.5 | 7.5 |
| Perceived performance | 4.5 | 7.0 | 8.0 |
| Accessibility | 4.5 | 7.5 | 8.5 |

Measured baseline evidence:

- one 1915 x 821 environment PNG, approximately 2.65 MB;
- four static 150 x 205 directional character images per archetype;
- visual position pushed through React state approximately every 34 ms;
- CSS `top` and `left` transition of 90 ms;
- visible travel jumps from 47 to more than 600 CSS pixels per 100 ms depending on route and camera;
- mobile scene translation measured above 300 CSS pixels in 102 ms;
- approximately 30.2 percent of the desktop viewport covered by permanent HUD and hotspot UI;
- duplicate self and coworker avatar observed at the same coordinates with the same sprite and z-index;
- world, roster and voice presence counts contradicted each other;
- Remotion autoplay warnings and browser-forced muting;
- deep object interactions replaced the world with a blurred backdrop and generic panel.

These measurements become regression tests or release checks. They are not historical notes to ignore.

## 5. North-star first 60 seconds

### 0-5 seconds: arrive

- The player enters through the Guildhall gate with a short, skippable arrival transition.
- The selected race and class are readable from silhouette before the nameplate is read.
- Three environmental anchors visibly move: fire, cloth/banner and a working prop or NPC.
- Ambient sound is available through an explicit sound control and never violates browser autoplay rules.
- Presence is truthful. Only real people or explicitly labeled demo actors appear.

### 5-12 seconds: understand the next action

- One primary quest beacon is visible.
- The world contains no marketing hero and no wall of permanent hotspot labels.
- Hover, focus or proximity reveals the object name and business meaning.
- Direct travel is visible as a secondary option.

### 12-22 seconds: move

- Click-to-walk and keyboard or virtual-stick input share one locomotion state machine.
- The character turns, accelerates, walks, plants feet and decelerates.
- Footstep timing, shadow, floor contact and foreground occlusion agree.
- The camera follows through a damped spring and never jumps the whole scene.

### 22-32 seconds: encounter a coworker

- A real coworker appears with status and speaking availability.
- Proximity is communicated before audio connects.
- Audio and video become clearer as distance closes.
- Wave, ring, whisper and walk-over actions are immediately understandable.

### 32-45 seconds: interact with work

- The project table reacts in the world before any interface opens.
- The map or plan physically unfolds, candles or runes respond and a short sound cue confirms selection.
- An anchored action ribbon offers a maximum of three actions: continue work, join voice or open details.
- A routine business action can finish without opening the full ERP.

### 45-55 seconds: earn recognition

- The successful canonical receipt triggers a Gold and renown response.
- Reward motion begins from the object or completed action, not from an unrelated toast.
- The wallet, Chronicle and world state update from the same receipt.
- Failure or pending approval never displays reward motion.

### 55-60 seconds: continue

- The next action becomes clear.
- The user remains in the same party, room, voice range and quest context.
- Returning from a deep workspace restores the exact world and camera state.

## 6. Target technical architecture

### 6.1 Rendering ownership

Recommended renderer: PixiJS or an equivalent WebGL-backed 2D scene renderer, subject to `ADR-REALM-001` spike validation.

Fallback if the spike fails: a native Canvas 2D scene renderer with the same scene-graph contracts. Falling back to DOM `top` and `left` movement is not allowed.

Responsibilities:

| Layer | Owner | Responsibility |
| --- | --- | --- |
| Business records | Existing RepositoryRealms services | Canonical data, authorization, receipt and audit |
| World projection | `RealmWorldAdapter` | Convert allowed business and presence data into world-safe view models |
| World simulation | `RealmWorldRuntime` | Position, velocity, navigation, interaction, camera and remote interpolation |
| Scene renderer | PixiJS or Canvas 2D | Draw floor, props, actors, effects, occlusion and lighting at the frame rate |
| Product UI | React | Command bar, accessible menus, action ribbon, deep workspace, error and fallback UI |
| Authored sequences | Remotion | Arrival, reward, object ritual and Chronicle replay sequences only |
| Presence and media | Existing Realm presence and LiveKit adapters | Truthful online state, proximity, tracks, speaking and degradation |

### 6.2 Scene graph

Every room uses an explicit ordered graph:

1. distant background and architecture;
2. walkable floor and navigation mask;
3. back props and ambient workers;
4. interactive props and stateful business objects;
5. local and remote actors;
6. foreground occluders;
7. local lighting, particles and weather;
8. world-space affordances;
9. screen-space product HUD.

No raster layer may carry business meaning or interaction by itself.

### 6.3 Runtime state model

The runtime owns ephemeral presentation state only:

- local position, velocity, facing and animation state;
- current route and navigation target;
- camera position, zoom and spring velocity;
- proximity contacts and active voice zone;
- selected world object and interaction phase;
- current quality tier and reduced-motion mode;
- transient effect and sound events;
- last safe world restore point.

It must not own canonical tasks, Gold balances, approvals, payroll values or authorization decisions.

### 6.4 Character system

Initial visible line-up:

- Elf;
- Dwarf;
- Human;
- Half-Orc;
- Tiefling or another approved fifth race.

Race controls silhouette and visual ancestry. Guild class controls outfit, equipment and animation flavor. Company role remains a plain-language business label and must not be inferred from race.

Minimum vertical-slice animation set per body family:

- idle breathing and look-around;
- eight-direction walk;
- start, stop and 45/90/180-degree turn;
- talk/listen;
- interact with table or prop;
- wave;
- celebrate;
- thank;
- request help;
- receive recognition;
- reduced-motion pose transitions.

Each animation includes explicit foot-contact or action markers so sound and effects are synchronized to the body.

### 6.5 Interaction grammar

Every world object implements the same state contract:

`idle -> discovered -> targeted -> approached -> ready -> acting -> pending -> succeeded | failed -> restored`

Object-specific feedback is mandatory. A forge, treasury, project table and roster cannot all use the same orbit and spark effect.

Immediate acknowledgement must occur before network work begins. Canonical success must remain gated by the real response.

### 6.6 Presence truth

One normalized identity key must drive world avatar, roster, party and voice:

`entityId + userId`

Multiple sessions for the same identity are aggregated. Self is excluded from remote actors. Session transport IDs are never treated as new people.

Required invariants:

- world remote actor count equals visible eligible roster count;
- online count uses the same normalized identity set;
- voice participants are a subset of online identities plus self;
- an identity cannot render twice at the same position because of multiple tabs;
- expired sessions disappear after the bounded heartbeat window;
- demo actors are labeled and never counted as real coworkers.

### 6.7 Remotion boundary

Remotion is retained for authored sequences with deterministic timelines:

- arrival and room transition;
- Gold and renown reward;
- forge, treasury and council rituals;
- Chronicle replay;
- optional cinematic environmental moments.

Remotion is prohibited for:

- continuous actor locomotion;
- remote interpolation;
- camera follow;
- collision and navigation;
- always-running copies of every actor or hotspot.

Every Player must declare mute behavior, reduced-motion behavior, lazy mounting and license handling. Production console warnings are a failed gate.

## 7. Detailed implementation phases

| Phase | Status | Outcome | Hard dependency | Exit gate |
| --- | --- | --- | --- | --- |
| 0. Contract freeze and baseline | Gate passed | Locked invariants, ADRs and measurable harness | This plan | ADRs, rollback and baseline harness verified |
| 1. Renderer and scene kernel | Gate passed | Layered Canvas2D world behind v3 flag | Phase 0 | Desktop/mobile frame and render budgets pass |
| 2. Locomotion vertical slice | Gate passed | Fixed-step movement replaces CSS sliding | Phase 1 | Keyboard, tap, collision and camera checks pass |
| 3. Character classes | Gate failed | Five procedural race/class silhouettes implemented | Phase 2 | External review still rates characters prototype-level |
| 4. Living Guildhall | Gate failed | Layered animated world and prop cycles implemented | Phase 1 and 3 | External visual benchmark remains below 7/10 |
| 5. Object interaction slice | Gate failed | Contextual ribbon and retained world context implemented | Phase 2 and 4 | Project-table quick action and context-perfect deep return need stronger proof |
| 6. Spatial social and voice | Gate failed | Identity normalization, roster, presence and existing voice adapters integrated | Phase 0, 2 and 3 | Zero-remote audit cannot prove two-user proximity/media soak |
| 7. Gold recognition loop | Gate passed | Receipt-bound lazy Remotion reward implemented | Phase 5 | Eligible mutation and no-pre-receipt checks pass |
| 8. Mobile and adaptive HUD | Gate passed | Tap movement, optional D-pad and adaptive HUD implemented | Phases 2, 5 and 6 | 360/393 focus, target, overflow and HUD gates pass |
| 9. Full object and entity rollout | Gate failed | All eight canonical surfaces mapped to one v3 runtime | Phases 5-8 | Success paths pass; per-object adverse-state matrix remains incomplete |
| 10. Optimization and release | Gate failed | Release candidate, metrics and rollback evidence produced | All prior phases | Independent score is 7.3/10; real-user soak absent |

### 7.1 Implementation evidence — 2026-08-17

- Runtime: native Canvas2D scene graph with fixed-step locomotion, camera spring, painter sorting, collision, adaptive quality, visibility pause and no React render per world frame.
- Characters: Elf, Dwarf, Human, Half-Orc and Tiefling silhouettes with race/class-specific procedural equipment, movement and labels.
- World: eight business objects, animated room props, truthful labeled demo actors, contextual action ribbons and direct Waygate travel.
- Social: normalized presence identity drives the world and roster; mobile presence status remains operable from the Members surface; existing proximity/party/media adapters remain connected.
- Gold: one eligible canonical wallet mutation triggers the lazy Remotion reward sequence and updates the wallet/Chronicle from the same operation.
- Mobile: default HUD coverage at or below 22 percent, 44 x 44 minimum visible controls, no horizontal overflow at 360 x 800, hidden D-pad removed from focus order, and duplicate offscreen object proxies removed.
- Rollback: `?world=v2` restores the prior scene and is labeled `Realm World v2 · rollback`.
- Automated evidence: `886/886` Node tests passed; the v3 desktop/mobile Playwright suite passed with one intentional desktop skip for the mobile-only gate; the final optimized production build passed after accessibility remediation.
- Measured live evidence: click/tap acknowledgement below 100 ms; desktop/mobile frame p95 approximately 16.8-17.0 ms; render p95 approximately 0.5-1.9 ms; console clean during the audited journeys.
- Independent strict audit: `7.3/10`, `NO-GO` for flagship release. There are no open P0 findings. Art direction `6.2`, world cohesion `6.8`, character quality `5.8`, motion `6.9` and spatial/social presence `6.4` remain below the release minimum; authored visual quality and real multi-user soak are the P1 blockers.

## 8. Phase work breakdown and gates

### Phase 0: contract freeze and baseline

Deliverables:

- create `REALM_WORLD_V3` feature flag with v2 fallback;
- inventory every current Realm object, panel, API, permission, receipt and audit link;
- create business-capability parity matrix;
- write `ADR-REALM-001` for renderer selection;
- write `ADR-REALM-002` for world and React ownership;
- write `ADR-REALM-003` for normalized presence identity;
- create deterministic movement, presence and object fixtures;
- capture desktop, tablet and mobile baseline videos and frame timings;
- add console-warning collection to Realm smoke tests;
- define a visual evidence directory that is ignored or intentionally versioned.

Exit gate:

- v2 remains unchanged and available;
- all eight current world objects and every business destination appear in the parity matrix;
- baseline movement discontinuity, HUD coverage, duplicate identity and autoplay warnings are reproducible;
- no implementation starts without renderer ADR approval.

### Phase 1: renderer and scene kernel

Deliverables:

- renderer spike with one room, one actor and three layered props;
- camera transform independent from React rendering;
- asset manifest, loader, cache, failure fallback and quality tiers;
- navigation mask and world-to-screen projection;
- z-sort and foreground occlusion;
- lighting and prop animation channels;
- React accessibility proxy for nearby interactive objects;
- pause, visibility-change and low-power behavior;
- deterministic screenshot mode for tests.

Exit gate:

- no React render is required for every animation frame;
- desktop target is 60 fps during camera movement;
- target mid-tier mobile remains at or above 45 fps;
- no long task above 50 ms during the standard movement trace;
- camera and actor can move for 60 seconds without drift, memory growth or console error;
- removing decorative layers leaves navigation and business actions usable.

### Phase 2: locomotion vertical slice

Deliverables:

- shared input abstraction for keyboard, click-to-walk, touch and direct travel;
- acceleration, velocity, deceleration and facing state;
- start, walk, turn, stop and idle animation transitions;
- foot-contact markers, footsteps and contact effects;
- navmesh route following with collision and rerouting;
- remote actor interpolation buffer;
- damped camera spring with dead zone and bounded velocity;
- input cancellation, focus loss and network correction handling;
- movement diagnostic overlay available only in development.

Numerical gate:

- visible input acknowledgement within 80 ms;
- no route begins with a teleport;
- no camera discontinuity above 24 CSS pixels in one rendered frame;
- normal walking displacement stays below 8 CSS pixels per 60-fps frame at the reference zoom;
- start and stop transitions visibly complete within 80-220 ms;
- foot-contact effects align with marked frames;
- a five-second movement trace has no React-state-per-frame update;
- keyboard, click and touch resolve to the same final world coordinate within tolerance;
- reduced motion preserves input and routing without bob, shake or cinematic travel.

Do not proceed to broad character production if this gate fails.

### Phase 3: character races and guild classes

Deliverables:

- one locked art-direction sheet covering anatomy, camera angle, palette, edge treatment, lighting and shadow;
- five silhouette-distinct race families;
- at least three guild-class outfit families for the vertical slice;
- modular palette, hair, skin, equipment and badge layers;
- animation atlas and manifest for every required core state;
- nameplate, presence, speaking and selected states that remain readable without covering the body;
- consistent avatar portrait derived from the same character identity;
- fallback character when an atlas fails;
- asset QA for transparency halos, inconsistent scale and lighting mismatch.

Exit gate:

- race can be identified from silhouette at gameplay scale without reading text;
- self and coworker never share an identical full appearance unless explicitly configured;
- no body is represented by a static sticker during movement or emote;
- character feet, shadow and scene lighting agree;
- all core animations pass loop, transition and reduced-motion review;
- mobile silhouette remains readable at the minimum supported zoom.

### Phase 4: living Guildhall

Deliverables:

- replace the single image with layered environment assets;
- create readable cycles for fire, cloth, clockwork, papers/maps and working props;
- add ambient actor routines only when they are truthful NPCs or clearly labeled demo actors;
- create room-specific lighting and sound zones;
- make project table, treasury, roster, council, gate and forge visually distinct before labels appear;
- add object state variants for idle, attention, active, pending, completed and unavailable;
- add subtle parallax and foreground occlusion;
- add reduced-motion and low-power variants that keep the room alive without constant motion.

Exit gate:

- at least three environmental changes are immediately readable during a ten-second observation;
- motion communicates world activity rather than decorative noise;
- each primary object is identifiable by shape and location;
- the scene remains understandable with all hotspot labels hidden;
- art-direction review scores world cohesion at least 7/10.

### Phase 5: project-table interaction vertical slice

This is the first complete proof of product value.

Deliverables:

- target, approach and arrival feedback;
- project-table object reaction;
- anchored action ribbon with clear business language;
- one quick action completed inside the world;
- one deep link into the existing ERP project workspace;
- pending, permission-denied, failed, stale and successful states;
- shared transition to deep workspace and context-perfect return;
- object and world state update from canonical receipt;
- Chronicle deep link and support ID.

Exit gate:

- selection acknowledgement begins within 80 ms;
- object reaction begins within 150 ms;
- quick action requires no generic modal takeover;
- deep work remains secondary and restores world state on return;
- no success or reward appears before receipt validation;
- keyboard, pointer and touch complete the same journey;
- a new user can explain what happened after one test without facilitator help.

### Phase 6: spatial social and voice

Deliverables:

- normalized identity and multi-session deduplication;
- truthful world, roster, party and voice counts;
- proximity ring and audio/video connection preview;
- speaking, muted, camera, busy, focus and do-not-disturb states;
- walk-over, wave, ring and whisper actions;
- private-area and quiet-mode boundaries;
- graceful reconnect, stale session expiry and ghost cleanup;
- remote interpolation and teleport correction;
- captions or transcript path where supported;
- voice permission education without unexpected prompts.

Exit gate:

- two tabs for one identity render one person;
- world, roster and voice counts satisfy the presence invariants;
- walking into range creates a visible connection progression;
- leaving range disconnects predictably;
- do-not-disturb prevents unwanted connection;
- a failed media permission does not break movement or messaging;
- no fake participant is displayed as a real coworker.

### Phase 7: Gold and recognition loop

Deliverables:

- receipt-bound reward event contract;
- Gold and renown sequence authored in Remotion and lazy-mounted;
- wallet, Chronicle and character progression update from one event;
- world-object response to recognized contribution;
- duplicate receipt replay protection;
- pending approval and rejected reward states;
- sound, visual and reduced-motion reward variants;
- clear source explanation and audit trail.

Exit gate:

- no reward sequence without a canonical eligible receipt;
- replaying a receipt never doubles Gold or animation-side state;
- animation can be skipped without skipping the ledger update;
- reward is understandable without sound or color alone;
- Gold remains separate from salary and protected employment rights.

### Phase 8: mobile and adaptive HUD

Deliverables:

- virtual stick or equivalent continuous movement control;
- tap-to-walk as the primary low-effort option;
- D-pad retained only as an accessibility alternative if validated;
- mobile camera dead zone and bounded spring;
- contextual action button and one primary quest indicator;
- collapsible location/direct-travel sheet;
- compact party and voice indicators;
- safe-area, software-keyboard and orientation handling;
- offscreen object proxy removal from focus order;
- mobile asset and effect quality tiers;
- haptic feedback where supported and nonessential.

Numerical gate:

- tap and hold both give visible feedback within 80 ms;
- avatar remains inside the safe gameplay region during travel;
- HUD coverage stays below 22 percent in the default state;
- no toast covers movement or primary interaction controls;
- no fixed control overlaps at 360 x 800, 390 x 844 or 393 x 851;
- no horizontal page overflow;
- all targets are at least 44 x 44 CSS pixels;
- no offscreen world object is keyboard-focusable;
- standard journey maintains at least 45 fps on the reference mobile profile.

### Phase 9: full object and entity rollout

Roll out only after the project-table vertical slice and social loop pass.

Objects and capability mapping:

| World object | Primary in-world action | Deep workspace | Canonical source |
| --- | --- | --- | --- |
| Guildhall gate | Start day, resume next action | My Work | Task and attendance services |
| Command dais | Review next decision | Command Center | Command and approval services |
| Guild roster | Find person, inspect availability | Staff and access | User, role and presence services |
| Project table | Continue task or milestone | Projects and tasks | Project execution services |
| Treasury | Inspect balance and recent source | Gold ledger | Gold journal and receipts |
| Lantern commons | Walk-over, whisper, message | Unified Inbox | Messaging and collaboration bridge |
| Council table | Join room voice and team work | Teamwork | Presence, party and media services |
| Forge | Inspect and redeem allowed reward | Reward catalogue | Gold redemption and approval services |

Entity rollout requirements:

- all current entities use the same engine and interaction contracts;
- entity-specific data and permissions come from adapters, not forked visual code;
- art may vary through a bounded theme/prop manifest;
- capability absence creates a truthful unavailable state, not a broken prop;
- language switching never translates business records, names or canonical identifiers.

Exit gate:

- parity matrix shows every old capability preserved or intentionally replaced;
- no entity forks the movement, presence or receipt engine;
- each object passes loading, empty, stale, offline, permission and success states;
- ERP fallback remains one direct action away.

### Phase 10: optimization, pilot and release

Deliverables:

- asset streaming and preload priorities;
- worker or off-main-thread work where profiling justifies it;
- memory and teardown audit;
- production warning and error budget;
- accessibility audit and reduced-motion review;
- visual, motion and audio regression suite;
- named internal pilot and feedback capture;
- rollback rehearsal to v2;
- release-candidate dossier with recordings and metrics.

Release gate:

- overall independent score at least 8/10;
- no dimension below 7/10;
- all P0 and P1 findings closed;
- production build and full relevant test suites pass;
- no console error and no unexplained warning;
- performance budgets pass on desktop and reference mobile;
- presence consistency soak passes;
- business parity and receipt audits pass;
- rollback to v2 is verified;
- user explicitly approves the flagship release candidate.

## 9. Performance budgets

### Runtime

- desktop frame target: 60 fps, p95 frame time at or below 16.7 ms in the vertical slice;
- reference mobile target: at least 45 fps, p95 frame time at or below 22 ms;
- input acknowledgement: at or below 80 ms;
- no movement long task above 50 ms;
- no React component-tree render on every world frame;
- remote interpolation remains smooth with simulated 150 ms latency and jitter;
- hidden tab pauses nonessential rendering and audio.

### Assets

- initial mobile visual payload target: at or below 1.0 MB compressed;
- initial desktop visual payload target: at or below 2.0 MB compressed;
- remaining room layers stream after the playable state;
- only the local character and visible remote archetypes are loaded initially;
- every large asset has mobile and reduced-quality variants;
- no duplicate decode of the full environment for occlusion masks;
- asset failure falls back without blocking business actions.

### Product UI

- default HUD coverage below 18 percent desktop and 22 percent mobile;
- no more than one primary world objective and one contextual action compete for attention;
- deep workspace opening does not blank or destroy the world context;
- skeleton or contextual pending state appears for waits above 300 ms.

## 10. Test strategy

### 10.1 Unit and contract tests

- locomotion state transitions;
- acceleration, deceleration and route completion;
- camera spring bounds;
- navmesh and collision resolution;
- identity normalization and multi-session deduplication;
- presence-count invariants;
- object interaction state machine;
- receipt-gated world and Gold effects;
- language protection for canonical data;
- quality-tier and reduced-motion selection.

### 10.2 Deterministic renderer tests

- fixed-time golden frames for actor states;
- layer order and occlusion;
- race and class silhouette snapshots;
- object states and reward sequence frames;
- asset failure fallback;
- reduced-motion frames;
- mobile and desktop camera framing.

### 10.3 Browser and interaction tests

Required viewports:

- 1440 x 900 desktop;
- 1280 x 720 desktop;
- 1024 x 768 tablet landscape;
- 768 x 1024 tablet portrait;
- 393 x 851 mobile;
- 390 x 844 mobile;
- 360 x 800 small mobile.

Required journeys:

1. Spawn, move, cancel and resume.
2. Click-to-walk to the project table.
3. Manual movement around collision and foreground props.
4. Quick task action and canonical receipt.
5. Deep workspace open and context-perfect return.
6. Two-person proximity and voice transition.
7. Multi-tab identity deduplication.
8. Gold receipt and idempotent replay.
9. Offline, stale, permission-denied and failed mutation.
10. Language switch with unchanged business records.
11. Reduced motion and muted audio.
12. Mobile tap, hold, virtual control and direct travel.

### 10.4 Perceptual QA

Each milestone is reviewed by an independent strict tester against:

- Baldur's Gate and Diablo principles for silhouette, motion continuity and action feedback;
- WoW and FFXIV principles for readable party, target and action priority;
- Gather and Spatial principles for truthful presence, proximity and spontaneous conversation;
- Palia-like principles for approachable social-world atmosphere and noncombat interaction.

The tester must provide recordings, measured evidence, severity and a GO or NO-GO recommendation. A self-authored implementation review alone cannot pass a visual gate.

## 11. Accessibility and safety gates

- all business actions remain keyboard-operable through React accessibility proxies;
- world interaction never relies on color, motion, sound, drag or proximity alone;
- reduced motion removes camera shake, bob, particles and nonessential travel while retaining state feedback;
- captions and text equivalents exist for essential audio cues;
- focus never enters offscreen world elements;
- direct travel supports users who cannot operate continuous movement;
- UI targets meet 44 x 44 minimum size;
- screen reader announcements describe selected object, travel status, action status and receipt result without narrating decorative motion;
- no employee ranking, hidden productivity scoring, inferred emotion or presence history is introduced;
- DND, busy and focus status changes both display and media behavior truthfully.

## 12. Proposed code and asset boundaries

Names are provisional until Phase 0 repository audit, but ownership must remain equivalent:

```text
components/realm-world-v3/
  RealmWorld.jsx
  RealmHud.jsx
  RealmActionRibbon.jsx
  RealmDeepWorkspace.jsx
  RealmAccessibilityProxy.jsx
  renderer/
  camera/
  actors/
  objects/
  effects/

lib/realm-world-v3/
  world-adapter.js
  world-runtime.js
  locomotion.js
  navigation.js
  camera.js
  presence-identity.js
  interaction-machine.js
  receipt-events.js
  asset-manifest.js

public/realms/world-v3/
  environments/
  actors/
  props/
  effects/
  audio/

tests/realm-world-v3/
tests/e2e/realm-world-v3.spec.mjs
docs/realms/adr/
```

The v3 module must consume existing business services through adapters. It must not copy or fork business rules into the renderer.

## 13. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Art throughput cannot support five races and states | Repeated or unfinished characters | Prove one body family and full animation set before scaling; use modular layers and strict manifest |
| Renderer adds too much bundle weight | Slow mobile load | ADR spike, dynamic import, route-only loading and quality tiers |
| Game layer hides business clarity | Work becomes slower | Action ribbon uses plain language; direct ERP and direct travel remain available |
| Presence remains session-based | Clone avatars and false counts | Normalize identity before social visual work; contract tests and soak |
| Remotion is overused again | Autoplay warnings and frame cost | Enforce boundary in lint/static tests and lazy-mount sequences |
| Mobile camera causes motion sickness | Unusable flagship experience | Dead zone, spring bounds, reduced motion and reference-device recordings |
| Visual polish outruns functional parity | Business capabilities disappear | Capability matrix and per-object parity gate |
| Large assets regress LCP | Scene feels slow despite animation | Progressive playable state, mobile variants and asset budgets |
| Fantasy language becomes confusing | Operational errors | Every action pairs thematic framing with explicit business meaning |
| Reward loop becomes coercive | Harmful workplace dynamics | Receipt-bound recognition, no ranking, no surveillance and clear policy explanation |

## 14. Release and rollback strategy

- v3 ships behind `REALM_WORLD_V3`.
- v2 remains the rollback target until v3 completes the pilot and release dossier.
- Presentation state uses a versioned key separate from v2.
- No database migration is required for scene-only state.
- Any new persisted character customization uses additive, reversible fields and explicit migration review.
- Runtime errors, renderer failure or unsupported capability fall back to the accessible direct-action surface, not a blank scene.
- Pilot activation is entity-scoped and reversible.
- Release never occurs from benchmark score alone. Business parity, security, accessibility and rollback must also pass.

## 15. Decision log

### D-001: Rebuild, do not polish

Accepted. The single-image, DOM-hotspot and panel-first architecture will not be the base of v3.

### D-002: Remotion is not the game engine

Accepted. Remotion remains for deterministic authored sequences. Continuous locomotion, camera and remote interpolation move to the scene runtime.

### D-003: Vertical slice before breadth

Accepted. Entrance, movement, one coworker, project table, one canonical work action and one Gold response must pass before all objects and entities are migrated.

### D-004: Presence truth before social polish

Accepted. Identity deduplication and count consistency must pass before adding richer social animation.

### D-005: Business capability over visual cleanliness

Accepted. No current business capability may be silently removed. A capability may receive a new interaction pattern only when the parity matrix shows its safe path.

### D-006: Native Canvas2D is the v3 renderer

Accepted. The Phase 1 spike meets the measured desktop and mobile frame budgets without a new WebGL dependency. The scene graph and simulation contracts remain renderer-independent so a later WebGL renderer can replace drawing without moving canonical business logic into the world runtime.

### D-007: Procedural art is an implementation bridge, not the flagship bar

Accepted. Procedural actors and props prove locomotion, scene ownership, capability parity and performance. The independent 7.3/10 review still leaves character quality at 5.8 and art direction at 6.2, so they do not satisfy the release target; authored atlases, state transitions and environment layers remain mandatory before flagship release.

### D-008: Preserve mobile controls through visible contextual placement

Accepted. CSS-hidden focusable controls are prohibited. Sound remains a visible world control; presence status moves to the visible Members surface on compact viewports; the hidden D-pad is disabled and removed from tab order until expanded.

## 16. Execution order

The first implementation batch must execute in this exact order:

1. Phase 0 capability matrix and three ADRs.
2. Renderer spike behind `REALM_WORLD_V3`.
3. One Elf or Half-Orc actor with complete locomotion states.
4. Entrance-to-project-table movement trace on desktop and mobile.
5. Strict tester review of movement and camera.
6. Fix until locomotion receives GO.
7. Add one real coworker and proximity truth.
8. Add project-table quick action and deep-work return.
9. Add one receipt-bound Gold response.
10. Score the complete 60-second vertical slice.

Do not create all race assets, all rooms, all object panels or all entity themes before step 10 passes.

## 17. Plan maintenance protocol

When work begins, change only the relevant phase status:

- `Planned`
- `In progress`
- `Blocked`
- `Gate failed`
- `Gate passed`

For every passed phase, append:

- implementation commit;
- tests and commands run;
- viewport recordings;
- measured performance;
- strict tester score;
- known limitations;
- rollback verification.

If a gate fails, record the evidence and keep the next phase `Planned`. Do not hide a failed gate by weakening its target without an explicit Decision Log entry.
