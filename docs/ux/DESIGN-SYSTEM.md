# RepositoryRealms design system proposal

Status: architecture proposal only  
Implementation gate: dependencies, tokens and production components must not change before founder approval

## E. Design-system architecture

### Design thesis

RepositoryRealms should look and behave like a precise digital workplace with a memorable spatial layer. The system is calm under heavy information, explicit about state, and decisive about the next action.

The visual identity should not imitate a generic enterprise kit. It should use custom composition, typography, color and spatial language on top of proven accessible behavior.

Five principles govern the system:

1. Action before decoration.
2. Hierarchy before card count.
3. Business language before fantasy language.
4. Evidence before confidence theater.
5. One record and one interaction grammar across ERP, Realm and CEO surfaces.

## 2. System architecture

The system has five layers.

| Layer | Owns | Does not own |
| --- | --- | --- |
| Foundations | color, type, spacing, radius, elevation, motion | business meaning |
| Primitives | button, field, menu, dialog, tabs, tooltip | domain layout |
| Work objects | status, owner, money, date, receipt, record link | page composition |
| Patterns | data table, queue, record header, editor, timeline | product navigation |
| Surfaces | Home, functional hubs, CEO Terminal, Realm | duplicate component behavior |

Primitives remain visually unopinionated enough to support dense ERP pages and the richer Realm environment. Surface differences come from composition and controlled emphasis, not a second component library.

## 3. Foundation tokens

Token names describe semantic purpose. Components must not introduce literal colors, arbitrary radii or local shadow systems.

### 3.1 Neutral and brand color

Proposed dark workplace palette:

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#0B0E14` | application background |
| `--surface-1` | `#111722` | primary surface |
| `--surface-2` | `#17202D` | raised or selected surface |
| `--surface-3` | `#202B39` | strong hover and spatial structure |
| `--border-subtle` | `#263241` | quiet division |
| `--border-strong` | `#3B4A5C` | focus-adjacent or structural division |
| `--text-primary` | `#F3F6FA` | primary text |
| `--text-secondary` | `#B0BCCB` | supporting text |
| `--text-muted` | `#7E8B9D` | metadata only |
| `--accent` | `#5B8CFF` | selected, active, link and primary action |
| `--accent-strong` | `#7BA2FF` | hover or dark-surface contrast |

Proposed light operating palette:

| Token | Value | Use |
| --- | --- | --- |
| `--canvas` | `#F3F5F7` | application background |
| `--surface-1` | `#FFFFFF` | primary surface |
| `--surface-2` | `#F8F9FB` | inset surface |
| `--surface-3` | `#EEF1F5` | selected and hover surface |
| `--border-subtle` | `#DCE2E9` | quiet division |
| `--border-strong` | `#AEB9C7` | structural division |
| `--text-primary` | `#151A22` | primary text |
| `--text-secondary` | `#465365` | supporting text |
| `--text-muted` | `#6E7B8D` | metadata |
| `--accent` | `#315FCC` | selected, active, link and primary action |
| `--accent-strong` | `#244AA5` | hover and pressed |

The dark palette is the default for Realm and may be enabled for focused operating surfaces. The light palette is the default for dense ERP work. Components use semantic tokens so theme is not coupled to function.

### 3.2 State color

Color is never the only state indicator.

| State | Color family | Required companion |
| --- | --- | --- |
| Success or completed | green | icon and text |
| Warning or at risk | amber | icon and text |
| Danger or blocked | red | icon and text |
| Information or active | blue | icon and text |
| Draft or neutral | gray | text |
| Restricted | violet-gray | lock icon and explanation |

State tokens include foreground, background, border and icon variants for both themes. Business statuses map to state families through one registry. Components never infer a color from raw status text.

### 3.3 Typography

- UI and editorial display: Geist Sans or the approved bundled variable sans.
- Data and identifiers: Geist Mono or the approved bundled mono.
- No decorative serif in operational UI.
- Use tabular numerals for currency, counts, dates and durations.
- Default body size is 14px at 20px line height on dense desktop surfaces.
- Minimum supporting text is 12px at 16px line height.
- Page titles use 24px to 30px, semibold, with compact tracking.
- Metric values use size only when the value directly affects a decision.

Hierarchy should come from size, weight, spacing and position before color.

### 3.4 Spacing, density and radius

Use a 4px base unit with the sequence `4, 8, 12, 16, 24, 32, 48, 64`.

Component density has three named modes:

| Mode | Row target | Use |
| --- | ---: | --- |
| Compact | 32px to 36px | expert tables and high-volume queues |
| Standard | 40px to 44px | default forms, lists and navigation |
| Comfortable | 48px to 56px | touch, onboarding and sparse decision screens |

Use one restrained radius system:

- `4px` for fields, table cells and small controls;
- `8px` for panels, menus and drawers;
- `12px` for dialogs and spatial overlays;
- pill shape only for tags, people presence and segmented controls.

Avoid nested rounded rectangles. A panel inside a panel usually needs spacing or a divider, not another card.

### 3.5 Elevation

Elevation communicates layering, not decoration.

- Level 0: canvas and inline regions, no shadow.
- Level 1: sticky header and raised panel, subtle border plus small shadow.
- Level 2: menu, popover and drawer.
- Level 3: modal dialog and critical overlay.

Realm may add localized ambient light and depth, but interactive panels still use the same elevation tokens.

### 3.6 Motion

Motion explains state changes and spatial relationships.

- 120ms for hover and pressed feedback.
- 160ms to 220ms for menus, drawers and view changes.
- 240ms maximum for spatial zone transitions.
- Use opacity and small translation for entry.
- Avoid springy motion in finance, approval and audit contexts.
- Respect `prefers-reduced-motion` and keep all operations available without animation.

## 4. Behavior foundations

### 4.1 Accessible primitives

After approval, use Radix Primitives for behavior-heavy foundations such as Dialog, Alert Dialog, Dropdown Menu, Popover, Tooltip, Tabs, Select, Label and Scroll Area. Radix is unstyled, supports WAI-ARIA patterns, and documents focus and keyboard behavior. RepositoryRealms owns all styling and composition.

References:

- <https://www.radix-ui.com/primitives/docs/overview/introduction>
- <https://www.radix-ui.com/primitives/docs/overview/accessibility>

This is a proposed dependency boundary, not permission to install it in the audit phase.

### 4.2 Data behavior

After approval, use TanStack Table as the headless state engine for shared data tables. RepositoryRealms owns markup, styling, responsive presentation and domain behavior. The engine provides a coherent basis for sort, filter, column visibility, sizing and server-side operation.

References:

- <https://tanstack.com/table/latest/docs/guide/column-visibility>
- <https://tanstack.com/table/latest/docs/guide/column-sizing>
- <https://tanstack.com/table/latest/docs/guide/column-filtering>
- <https://tanstack.com/table/latest/docs/guide/sorting>

### 4.3 Icons

Adopt one consistent icon family, proposed Phosphor, with regular weight as default and filled variants only for selected navigation or strong state. Do not draw SVG paths inside feature code.

- Controls use icons with visible labels unless universally understood.
- Icon-only controls require an accessible name and tooltip.
- Status always combines icon, label and semantic color.
- Decorative illustrations are not used as functional icons.

## 5. Primitive component inventory

### Inputs and actions

- `Button`: primary, secondary, quiet, danger and link variants.
- `IconButton`: requires accessible name and tooltip.
- `TextField`, `TextArea`, `NumberField`, `MoneyField`.
- `Select`, `Combobox`, `MultiSelect`, `DatePicker`.
- `Checkbox`, `RadioGroup`, `Switch`.
- `FileUpload` and attachment list.
- `Field`, `FieldGroup`, `FormSummary`, `InlineError`.

Buttons express action priority. Destructive actions are never the default focused action. Loading buttons retain their label and announce progress.

### Navigation and disclosure

- `AppNav`, `NavGroup`, `Breadcrumbs`, `LocalTabs`.
- `CommandPalette`, `Menu`, `ContextMenu`, `Popover`.
- `Disclosure`, `Tooltip`, `Pagination`.
- `MobileBottomNav`, `MobileHeader`.

### Feedback and overlays

- `Toast` for transient confirmation only.
- `InlineNotice` for persistent information in context.
- `Banner` for system or company-wide conditions.
- `Dialog`, `AlertDialog`, `Drawer`.
- `Progress`, `Skeleton`, `Spinner`.
- `StatePanel` for empty, error, offline, restricted and no-result states.

Every overlay must trap focus when modal, restore focus on close, handle Escape where safe, prevent background interaction and announce its title. Dirty forms require an explicit discard decision.

## 6. Work-object components

Work objects encode product semantics.

- `RecordLink`: type icon, primary label, optional secondary identifier.
- `Status`: icon, business label and semantic state.
- `Owner`: avatar, name, team and assignment affordance.
- `PersonPresence`: available, focused, away or offline.
- `Money`: currency-aware, tabular, negative and estimated states.
- `DateTime`: absolute value with contextual relative text where useful.
- `DueDate`: due, overdue, completed and no-date behavior.
- `Priority`: explicit business label, not color alone.
- `ModuleGate`: enabled, unavailable or upgrade explanation.
- `PermissionNotice`: restricted or partially redacted content.
- `Receipt`: actor, action, target, result, timestamp and next option.
- `AuditEvent`: durable event with source and changed fields.
- `Attachment`, `Comment`, `Mention`, `ActivityEvent`.

These components centralize terminology. A raw API enum must not be presented directly to the user.

## 7. Core patterns

### 7.1 Action queue

The action queue is the central Home and My Work pattern.

- Sections: Now, Next, Blocked, Later.
- Each row exposes subject, reason, owner, due state and one primary action.
- Secondary actions remain in an overflow menu.
- Bulk actions appear only when selection begins.
- Completing an item creates a receipt and moves focus predictably.
- Empty sections collapse; an empty entire queue shows the next useful place to go.

### 7.2 Data table

The shared `DataTable` includes:

- server or client sort and filter adapters;
- global search and field filters;
- column visibility and sizing;
- sticky headers and key identity columns;
- saved views with share and personal scope;
- row selection and bulk actions;
- pagination or windowed loading;
- keyboard row traversal and focus-visible states;
- loading, partial, empty, filtered-empty, error, offline and restricted states;
- export that respects permission, selected fields and current view;
- column-specific rendering through work objects;
- responsive priority rules defined by each domain.

On narrow screens, a domain-specific row becomes a compact list item with a primary label, two or three critical facts and one action. The system must not transform every table cell into a long generic card.

### 7.3 Record header

The record header includes:

- record type and breadcrumb;
- primary name and identifier;
- status, owner and updated time;
- one primary next action;
- secondary actions in a menu;
- permission or stale-data notice when required.

### 7.4 Editor workspace

Quotes, invoices, contracts and other complex documents use a full-page editor.

- Persistent document identity and save status.
- Structured line-item table with keyboard editing.
- Summary and totals remain visible.
- Validation appears at field and document level.
- Autosave or explicit save behavior is unambiguous.
- Leaving a dirty document requires confirmation.
- Preview, issue, approve and export are separate stages.

### 7.5 Decision workspace

Approval and executive decisions show evidence before action.

- Request and requested outcome.
- Actor and ownership chain.
- Amount, risk or consequence.
- Related record evidence.
- Policy or threshold context.
- Comment or reason.
- Approve, reject, request changes or delegate as permitted.
- Immutable receipt after action.

### 7.6 Activity and receipts

Transient toasts acknowledge that an interaction was accepted. Receipts prove the outcome.

Every consequential mutation should expose:

- what changed;
- who changed it;
- when the server accepted it;
- whether downstream work remains;
- how to inspect or reverse it when allowed.

## 8. Page templates

Templates guide hierarchy but do not force identical layouts.

| Template | Dominant object | Examples |
| --- | --- | --- |
| Role Home | action queue | dashboard, CEO briefing |
| Section Home | exceptions plus entry views | Sales, Finance, People |
| Record Index | data table or domain list | clients, invoices, employees |
| Record Detail | record header plus work surface | project, client, employee |
| Editor | document or structured form | quote, invoice, settings |
| Decision Queue | evidence and action | approvals, violations |
| Control Center | exceptions and operating controls | Team Work, automation |
| Spatial Home | workplace scene plus accessible zone list | Realm Home |
| Conversation | thread plus context inspector | messages, Realm room |

## 9. Surface language

### 9.1 ERP

ERP defaults to the light operating palette, compact or standard density, restrained elevation and strong table and form patterns. It should feel durable, fast and inspectable.

### 9.2 Realm

Realm defaults to the dark workplace palette. A subtle spatial canvas can use rooms, desks, connectors, live presence and ambient state. Standard panels appear when users enter a zone. The spatial layer should make relationships easier to understand, not decorate a dashboard.

Realm must not use fake game currency, medieval frames, quest language, heraldry or walking mechanics for business work.

### 9.3 CEO Terminal

CEO Terminal uses the same system with larger hierarchy and lower visible density. It prioritizes decisions, material exceptions and confidence in evidence. Large metric walls, repeated cards and decorative command-center language are not part of the target.

## 10. Complete state model

Every data-bearing pattern must define the following states before implementation is accepted.

| State | Required treatment |
| --- | --- |
| Initial loading | layout-preserving skeleton or progress with accessible label |
| Background refresh | subtle freshness indicator, existing data remains usable |
| Success | data plus last-updated context where material |
| Empty | explain why, offer one relevant next action |
| Filtered empty | preserve filters, explain no match, clear-filter action |
| No search result | show query, suggested correction or scope change |
| Partial result | identify unavailable source and preserve available work |
| Error | plain explanation, retry and support detail when useful |
| Offline | identify cached or unavailable actions, preserve drafts |
| Stale | show age and refresh path; protect conflicting mutations |
| Forbidden | explain scope without exposing sensitive content |
| Redacted | show field-level restriction and reason where allowed |
| Disabled module | explain entitlement or company configuration |
| Saving | preserve context, prevent duplicate submission |
| Saved | durable receipt or explicit save state |
| Conflict | compare or reload path, never silently overwrite |
| Destructive pending | consequence, target identity and explicit confirmation |

## 11. Form standards

- Labels remain visible. Placeholder text is an example, never the label.
- Required and optional treatment is consistent.
- Validate on blur for field issues and on submit for complete rules.
- Errors appear beside the field and in a summary for long forms.
- Focus moves to the first invalid field after submit.
- Preserve typed data after server or network errors.
- Explain units, date zones, currency and company context.
- Dependent fields expose why they are unavailable.
- Bulk edits preview affected records and fields before commit.
- Destructive changes require the target name and consequence.

## 12. Accessibility standards

Minimum implementation gate:

- WCAG 2.2 AA contrast targets for text and controls;
- complete keyboard operation for navigation, tables, forms and overlays;
- logical heading and landmark structure;
- visible focus with at least 2px equivalent contrast;
- accessible names for every control;
- announcements for async status and validation;
- no color-only meaning;
- pointer targets of at least 24 by 24 CSS pixels, with 44px preferred for touch;
- reduced-motion support;
- focus containment and restoration for modal overlays;
- screen-reader alternatives for spatial Realm scenes and charts;
- zoom and reflow without lost actions at 200 percent.

Automated checks are required but do not replace manual keyboard and screen-reader review.

## 13. Responsive standards

Responsive behavior is based on available space and task priority, not device labels alone.

- Sidebar collapses before content becomes unreadable.
- Context inspectors become drawers on narrow layouts.
- Record actions remain reachable in a sticky mobile action bar when needed.
- Tables define priority columns and a domain list renderer.
- Editors retain totals and validation without horizontal page scrolling.
- Charts provide a readable summary and data table alternative.
- Realm provides a zone list when the spatial scene cannot remain usable.
- Fixed navigation reserves layout space and must not cover content.

## F. Component migration map

| Current implementation | Target | Treatment |
| --- | --- | --- |
| `components/ui.jsx` hand-built `Icon` | `ProductIcon` adapter | replace paths with one icon library after approval |
| `Badge` and page-local status chips | `Status` plus centralized registry | migrate enum mapping and remove color-only state |
| `Modal` | `Dialog` or `Drawer` | use accessible primitive behavior and explicit ownership |
| `FormModal` | form primitives plus page, drawer or dialog shell | split by workflow complexity |
| `ToastProvider` | `Toast` plus durable `Receipt` | keep transient feedback, add proof of outcome |
| `useResource` | query adapter | preserve data contract, add state and freshness semantics |
| `ExportCsv` | `DataTable` export action | permission and current-view aware |
| `EmptyState` | `StatePanel` | cover empty, filtered, offline, restricted and error states |
| raw feature `<table>` elements | `DataTable` or domain list | migrate behavior and responsive rules |
| global mobile table CSS mutation | domain responsive renderer | retire generic cell-label transformation |
| `components/Shell.jsx` | `AppShell` modules | split nav, command, inbox, search and company context |
| page-local form styles | field primitives and tokens | remove literal color, radius and spacing duplication |
| legacy Realm components and CSS | retire | no visual preservation requirement |
| Realm v2 local primitives | shared surface patterns | merge into the canonical design system |
| CEO route-specific card pages | CEO Terminal templates | consolidate local navigation and decision patterns |

## 15. Governance

### Token and component rules

- New literal colors, shadows and radii fail review unless added as approved tokens.
- New overlay behavior must use the shared primitive.
- New status values require registry mapping and state tests.
- New tables require column priority, empty states and mobile behavior.
- New business terminology requires product-language review.
- New feature pages must declare template, primary action and critical states.

### Definition of done

A component or screen is complete only when:

- visual and interaction specifications are represented in Storybook or the approved equivalent;
- keyboard and focus behavior is tested;
- loading, empty, error, offline, forbidden and stale states are covered where relevant;
- mobile behavior is intentional;
- role, module and company boundaries are tested;
- consequential actions create receipts;
- analytics identify completion, failure and abandonment without logging sensitive data;
- no capability from `SCREEN-MATRIX.md` was silently removed.

## 16. Recommended implementation sequence

1. Approve IA, language, tokens and dependency boundary.
2. Build foundations, accessible primitives, status registry and state panels.
3. Build App Shell, command palette, action queue and DataTable.
4. Migrate Home and My Work as the reference vertical slice.
5. Migrate one record family end to end, recommended client to quote to invoice.
6. Migrate People, Operations and remaining functional hubs.
7. Build the canonical Realm on shared records and components.
8. Consolidate CEO Terminal.
9. Remove legacy Realm and compatibility styling only after route and telemetry checks.

No production step begins in the audit phase.
