# Realm v2 Visual Baseline — Phase 0

This directory is the measurable starting point for bringing the authenticated product to at least 95% fidelity with the 18 approved Realm v2 areas.

## What is locked

- 18 product-area aliases and their canonical destinations.
- Five viewports: `375`, `390`, `768`, `1024`, and `1440` pixels wide.
- Fourteen approved visual boards, verified by SHA-256 and PNG dimensions.
- A seven-dimension, 100-point scoring rubric.
- A P0/P1/P2 defect register.

## Capture an authenticated baseline

Credentials are supplied only through environment variables and are never written to artifacts.

```powershell
$env:REALM_V2_BASELINE_URL='https://<crmegoric-realms-demo-preview>.vercel.app'
$env:REALM_V2_BASELINE_EMAIL='<preview-account>'
$env:REALM_V2_BASELINE_PASSWORD='<preview-password>'
npm run realm:v2:baseline:capture
```

The capture follows every `/realm-v2/<area>` alias, records the canonical final path, viewport, language, horizontal overflow, runtime errors and screenshot hash, and writes exactly 90 PNG files to `current/`.

## Verify integrity

```powershell
npm run audit:realm:v2:baseline:check
```

The audit validates the reference lock, configuration, scorecard calculation, screenshot manifest and current image hashes. It intentionally does not require a passing 95% score during Phase 0; the gap is the input to implementation phases.

## Release scoring

| Dimension | Weight |
| --- | ---: |
| Layout and information hierarchy | 25 |
| Component fidelity | 20 |
| Tokens, typography, borders and elevation | 15 |
| Responsive/mobile composition | 15 |
| Interaction and resilience states | 10 |
| Accessibility | 10 |
| Localization and perceived performance | 5 |

Release requires an aggregate score of at least 95, no area below 90, a stable-region visual diff of at most 5%, no horizontal overflow at the five locked widths, VI/EN without clipping, and no successful business action without a canonical receipt.
