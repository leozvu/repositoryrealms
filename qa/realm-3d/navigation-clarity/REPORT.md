# Realm navigation, camera and clarity

Candidate build: `585c-bVPJ9w1auuscamXU`. Local preview: http://127.0.0.1:3410/realm-demo?world=3d. This report covers one implementation batch, not AAA acceptance.

## Changes

- Automatic station selection now opens the existing work panel within 18 cm of its navigation destination, instead of the general interaction radius. The actor faces the nearest work surface for that station. Manual nearby interaction keeps its existing range and permission checks.
- The follow camera clips its boom after spring interpolation against padded bounds of explicit major obstacles: walls, columns, bookcases, hearth, noticeboard and bay posts/screens. This is not triangle-level coverage of every prop. First-person and overview modes retain their existing behavior.
- Resolution can recover by 0.1 after six seconds of consecutive frames at or below 22 ms, with a cooldown between changes. The saved Clarity preference enforces a 0.75 scale floor relative to the current mode's capped render ratio. It does not guarantee 75% native display resolution; the mode still has pixel and density limits.
- Paused workspace background frames and texture-loading throttling no longer enter the active-frame diagnostic sample. The diagnostic remains requestAnimationFrame timing during automation, not GPU profiling.
- Graphics settings explain the resolution preference, persist it across reload and support Escape with focus restoration. The menu scrolls within the mobile viewport.

## Verification

44 focused unit tests passed with no failures or skips. Tests include thin/parallel/diagonal camera obstruction, real shelf bounds, all eight station destinations reached within 18 cm, rejection of the former premature archive position, clarity floors, overload handling and sustained recovery. The production build passed and generated 91 static pages.

Browser verification: **8 passed, 0 failed**, 7.4 minutes, one worker and no retries. The four scenarios run on desktop Chromium and Pixel 5 emulation: camera switching/overflow, archive round-trip with exact arrival and High+Clarity, resolution persistence/Escape focus after reload, and work locations. The last scenario covers all eight stations on desktop and two stations on mobile. No page errors were recorded. This is the selected browser suite, not the full app regression suite.

Commands:

```text
node --test tests/realm-office-3d.test.mjs tests/realm-office-avatar.test.mjs tests/realm-office-camera.test.mjs tests/realm-office-ceiling-picking.test.mjs tests/realm-office-lifecycle.test.mjs tests/realm-office-materials.test.mjs tests/realm-office-quality.test.mjs tests/realm-office-scene.test.mjs tests/realm-preview.test.mjs
npm run build
npm run realm:preview
# PLAYWRIGHT_PORT=3410
npx playwright test tests/e2e/realm-office-3d.spec.mjs --workers=1 --grep "medieval work bay|3D office has|resolution preference|each work location" --max-failures=1
```

Evidence: [build log](build.log), [unit log](unit.log), [browser log](browser.log), [manifest with hashes](manifest.json), [desktop High](desktop-medieval-bay-high.png), [mobile High](mobile-medieval-bay-high.png), [desktop observation](desktop-medieval-observation.json), [mobile observation](mobile-medieval-observation.json).

## Visual and performance limits

The desktop High capture reaches archive coordinates (-10.20, -3.75), facing the work surface, with Clarity scale 0.75 and textures ready. Books remain flat primitive blocks, the shelves lack authored detail, and the character/architecture/lighting remain well below the approved concept target. Sharper output does not repair those asset deficiencies.

Both High observations record scale 0.75 with materials ready. Desktop is 1280×720, archive (-10.20, -3.75), diagnostic frame-p95 683 ms; mobile is 393×727, archive (-10.09, -3.65), diagnostic frame-p95 483 ms. These timings include active automated interactions and capture overhead and are not a GPU benchmark. They provide no 60 FPS performance pass. Mobile coverage is Chromium Pixel 5 emulation, not a physical phone. The recovery algorithm is unit-tested under controlled timing; the slow browser run does not demonstrate sustained on-device recovery. No seated animation or hand IK was implemented, and no multiuser call or long-duration soak was performed.

G1 remains In progress. All 36 acceptance rules retain NOT_TESTED status. No score, release gate or engine decision is upgraded from this batch.
