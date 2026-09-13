# Realm medieval G1 — construction pass

Status: **G1 IN PROGRESS — NOT AN AAA ACCEPTANCE**

Production build: `Ulg4NzwQ6tSysXQj7rycN`.
Preview: `http://127.0.0.1:3410/realm-demo?world=3d`.
To inspect the new work area: **Địa điểm → Thư viện → close the workspace → Góc nhìn**.

## Implemented

- A dedicated metre-authored archive work bay: individually joined desktop boards, breadboard ends, pegs, aprons, an unobstructed central knee space, drawer, braced timber screen, two slatted chairs, linen cushions, folio bench, bound ledger, ink pot, quill and seal.
- The new furniture uses the actual flagstone surface as its floor reference. Desktop height is 0.75 m above that surface; cushion top is 0.477 m. It is excluded from the old hall-wide Y scaling.
- Grain is mapped in each construction part's local coordinates and retained through material batching. Static detail does not create one draw call per peg or page rule.
- Three real holes through the north masonry replace glazing mounted against a solid wall. Glass is transparent; iron tracery replaces gold window ornaments. A geometric exterior courtyard provides parallax beyond the windows.
- The existing archive/briefing action and all other established workstation identities are preserved. New desk picking volume matches its smaller footprint. No additional ERP permissions, fake business text or fictional activity was added.

## Verification

- Focused unit/regression suite: **39 passed, 0 failed** on final source. Log: `.codex-runtime/unit-medieval-g1-final.log`.
- New geometry tests raycast the final batched desktop and the real stone floor to measure height, check a clear knee path, finite owned geometry and actual wall openings. Existing tests check pairwise paths among spawn and all eight stations, invisible picking volumes and overhead/camera picking.
- Final production build: **PASS**, 91 static pages. Log: `.codex-runtime/build-medieval-g1-final.log`.
- An earlier construction build passed one desktop archive/camera test. This is historical evidence only; final build verification is recorded below.
- Final browser result: **4 passed, 0 failed**, in 2.9 minutes. Desktop camera 34.7s, desktop archive 58.9s, mobile camera 18.5s, mobile archive 47.4s. Targeted tests cover camera switching and archive round-trip, including selection of High graphics. The mobile profile is Chromium Pixel 5 emulation, not a physical phone. This is not the full browser suite or a device performance benchmark.
- Browser page errors: none in the targeted archive runs. Both final observations report High, all materials ready and render scale **0.55**. Desktop output 1280×720; mobile output 393×727. Diagnostic frame-p95 values were 433ms / 333ms during automated interaction/capture; they are not GPU profiling or proof of 60 FPS. The observed scale is below the proposed D60/D30 minimum, so these runs cannot qualify for those profiles.
- [Evidence manifest](manifest.json) contains build identity, six screenshots, two observation records and hashes. [Desktop High](desktop-medieval-bay-high.png) and [mobile High](mobile-medieval-bay-high.png) show the real rendered result. Source measurements are in [desktop observation](desktop-medieval-observation.json) and [mobile observation](mobile-medieval-observation.json).

Visual review of those captures: the desk silhouette, slatted chair, writing objects and daylight shadows are now present. The shelf books and other older assets remain visibly primitive, image sharpness is below the concept target, and the hall's side enclosure/lighting still needs architectural work. No art score was assigned from these captures.

## Remaining gaps

This is an authored geometry construction pass within the existing renderer, not completed DCC/sculpted production assets. The avatar, most room furniture, books and roof still use the previous procedural construction. The new area has no seated player animation, hand IK interaction or authored normal/roughness bake unique to the desk. The exterior is limited scenery; it is not a playable courtyard.

The light preset deliberately reduces rendering complexity and may reduce framebuffer scale. Its screenshot cannot prove the High art target. Even a High screenshot must record actual render scale; it does not establish 60 FPS or the D60 profile. The current adaptive floors may be below the new 75% acceptance floor.

No G1/G2/G3 gate is marked passed. No full 36-rule assessment, device matrix, multiuser voice soak, independent art review or 100-hour user study took place in this batch. Existing earlier failures are not erased by a narrower successful test.

## Next necessary work

1. Review the final High captures against the design board and fix the largest visual differences.
2. Produce/import a period-consistent human character with a full rig and seated interaction set; replace the current procedural avatar only after contact and locomotion review.
3. Replace the remaining primitive books, shelf construction and room kit around the bay; author lighting for the room rather than treating environment light as a substitute for architectural bounce.
4. Lock the physical-device profiles, then evaluate the G1 subset of the acceptance rules with measured performance and human review.
