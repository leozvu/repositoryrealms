# DS-02 — Application Shell and Navigation

Status: visual direction v1 locked  
Depends on: DS-01 foundations and primitives

## Purpose

The shell keeps users oriented while they move between operational contexts. It does not own business records and must not imply access that canonical authorization has not granted.

## Desktop anatomy

| Region | Token | Contract |
| --- | --- | --- |
| Expanded navigation rail | `240px` | Default at wide desktop when user preference permits |
| Collapsed navigation rail | `72px` | Icons retain accessible names and tooltips |
| Top command bar | `56px` | Company, workspace, search, environment, collaboration and account controls |
| Page header | `72px` minimum | Breadcrumb, title, metadata and one primary action |
| Main workspace | Fluid | Owns document heading and route focus target |
| Context drawer | `400px` | Contextual work only; never primary navigation |
| Status and receipt region | `44px` minimum | Persistent command state and canonical receipt feedback |

Decorative frames live outside these measurements and never reduce the interactive or readable content box.

## Navigation information architecture

### Primary destinations

- Realm Home
- My Work
- Projects
- Action Center
- Command Center
- Inbox
- Chronicle
- World Map

### Privileged destination

- CEO Terminal

### Secondary destination

- Settings

The profile and presence block is anchored at the bottom of the rail. Sign out is separated from normal destinations inside the profile menu.

## Navigation-item states

| State | Required cues |
| --- | --- |
| Default | Icon and visible text label |
| Hover | Subtle surface change; no layout movement |
| Active | Weight, icon treatment and left indicator; never color alone |
| Focus | Visible 2px information-blue ring |
| Disabled | Disabled semantics, reduced emphasis and explanation |
| Unavailable | Lock/status icon plus a reason when disclosure is safe |
| Loading | Stable bounds and local progress indicator |

If revealing a destination would itself disclose sensitive capability or entity existence, omit it according to the canonical authorization policy. Otherwise, prefer a visible unavailable state with a reason over silent disappearance.

## Top command bar

Order from orientation to personal context:

1. Company switcher.
2. ERP/Realm workspace switcher.
3. Global search and command palette trigger.
4. Environment indicator.
5. Notifications.
6. Active collaborators.
7. Profile menu.

The global search/command trigger is the primary visual anchor. Notification badges are reserved for unread or pending state and clear after the relevant content is visited or acknowledged.

## Page orientation

- Use breadcrumbs at three or more hierarchy levels.
- Page title is the route's `h1` and may wrap to two lines.
- Keep one primary action visible.
- Move excess secondary actions into an overflow menu before shrinking labels.
- Saved views and filter summaries sit below the page identity, not inside global navigation.
- Route change moves programmatic focus to the page heading without forcing a scroll jump.

## Context drawer

- Desktop: docked or overlay drawer at 400px depending on available workspace width.
- Tablet: overlay drawer with a 40–60% scrim.
- Mobile: bottom sheet with a clear close affordance and safe-area padding.
- Escape closes desktop/tablet drawers and returns focus to the trigger.
- Focus is trapped while an overlay drawer is open.
- Dismissal with unsaved changes requires confirmation.
- Drawer tabs may contain Overview, Tasks, Approvals, Files and Activity.
- Drawer state may be deep-linked only when the target record is authorized and the URL remains safe to share.

## Responsive contract

| Width | Primary navigation | Context surface | Density |
| --- | --- | --- | --- |
| `>= 1280px` | 240px rail; user may collapse to 72px | Docked or overlay drawer | Compact or comfortable |
| `1024–1279px` | 72px rail | Overlay drawer | Compact |
| `768–1023px` | Collapsed rail or top-level adaptive navigation | Overlay sheet | Comfortable touch |
| `< 768px` | Bottom navigation | Bottom sheet | Touch-first |

Mobile bottom navigation contains exactly five labeled top-level destinations: Home, My Work, Actions, Inbox and More. It never duplicates a sidebar at the same hierarchy level.

## Continuity and navigation state

- Stable deep link for every key destination.
- Browser/system back restores scroll position, filters, selected tab and safe draft state.
- Navigation never silently resets the stack or jumps to Realm Home.
- Primary navigation remains reachable from deep pages.
- Search and command results must respect authorization before rendering labels or snippets.

## Keyboard and assistive technology

Focus order:

1. Skip to main content.
2. Navigation rail.
3. Top command bar.
4. Main content.
5. Context drawer when opened.

Additional requirements:

- Icon-only collapsed controls expose accessible names.
- Active destinations expose `aria-current="page"`.
- Expand/collapse controls expose `aria-expanded`.
- Unread badges have accessible text, not only a number or color.
- Touch targets are at least 44×44px with at least 8px separation.
- No navigation action depends on hover, drag or gesture alone.

## Motion and layers

- Standard transition: `180ms ease-out` using opacity and transform.
- Exit transition: approximately 120ms.
- Reduced motion: remove translation and use an immediate or minimal crossfade.
- Layer scale: base `0`, sticky `10`, dropdown `20`, drawer `40`, modal `100`, toast `1000`.
- Fixed bars reserve content inset so controls and records are never obscured.

## Acceptance checklist

- Current location is obvious without relying on color.
- Every destination is keyboard reachable.
- Mobile has no horizontal scroll and no compressed desktop rail.
- Back navigation restores context.
- Route focus and drawer return-focus behavior are verified.
- Authorization is checked before destination labels, counts or snippets are rendered.
- Decorative layers can be disabled with no layout or semantic loss.

