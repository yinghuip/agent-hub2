# Agent Hub catalog: visual redesign

Reference theme: `https://www.bridgestone.com.sg/en`. Tokens below were read off
the live site, not recalled.

**Design read:** redesign (visual overhaul, content and IA preserved) of the
Agent Hub catalog, for engineers scanning an internal registry, in an
industrial-technical language borrowed from Bridgestone SG, leaning toward
sharp-cornered structure, condensed uppercase display type, and a single
saturated red accent.

**Mode: Redesign - Overhaul.** New visual language, existing content, routes,
role taxonomy and JSON index untouched. Nothing in `dist/site/index.json`
changes, so the tested seam stays the tested seam and this work is presentation
only.

## 1. Dials

| Dial | Value | Reasoning |
| --- | --- | --- |
| `DESIGN_VARIANCE` | 6 | Overhaul is existing (4) + 2. Bridgestone is grid-disciplined, not artsy. Asymmetry belongs in the hero and in tile spans; the listing grid stays regular because people scan it. |
| `MOTION_INTENSITY` | 4 | Existing site is fully static (1). A dev tool earns restraint. 4 is what a static generator with no animation library can honestly ship: CSS transitions plus one IntersectionObserver reveal. |
| `VISUAL_DENSITY` | 5 | Redesign rule says match existing (4). Nudged to 5: the catalog's job is fitting many plugins on one screen, and the reference is a dense tile site. |

## 2. Scope boundary (honest read)

This skill is for landing pages, portfolios and redesigns. The Agent Hub catalog
is **half landing page, half product UI**:

- **Landing-page surfaces** (full treatment applies): homepage hero, the two-paths
  section, the request page, the footer.
- **Product-UI surfaces** (treatment applies with judgement): the role-filtered
  plugin grid, the plugin detail page, the search and filter controls. These are
  scanning surfaces. Marketing devices belong nowhere near them, and rules
  written for marketing bento grids (photographic tiles, background diversity per
  cell) are deliberately not applied there. Variation comes from tile span and
  typography instead of imagery, which is stated here rather than left implicit.

Photography is wrong for this product. There is no image-generation tool in this
environment, and stock imagery on an internal skills registry would be pure
decoration. The visual weight comes from type, rule lines, the red accent, and
two inverted bands.

## 3. Reference audit: what the theme actually is

Measured on the live homepage.

| Property | Measured value | Take or leave |
| --- | --- | --- |
| Accent | `rgb(228, 35, 0)` = `#E42300` | **Take.** One accent, high saturation, used on CTA fills. |
| Utility blue | `rgb(40, 118, 228)` on the "find a store" tile | **Leave.** Max one accent per project. |
| Neutrals | `#222326`, `#000`, `#FFF`, `#DFDFE0`, `#8D8D8D`, `#5A5A5A`, `#E6E6E6`, `#F7F7F7` | **Take.** Cool-neutral grey ramp, no warmth. |
| Display type | `BridgestoneType-Cd` (condensed), uppercase on 116 of 116 headings | **Take the treatment**, substitute the face (proprietary). |
| Border radius | `0px` across all 218 interactive elements | **Take.** The single strongest signal, and the sharpest break from what we have. |
| Structure | Fixed dark left rail of icon plus micro-label nav, utility bar on top, full-bleed dark media blocks alternating with white content | **Take the rail idea**, repurposed (see 6.1). |
| Devices | Uppercase micro-labels, hard-edged red CTA blocks, heavy black and white contrast | Take. |

## 4. Current-state audit: what to retire

| Present today | Verdict |
| --- | --- |
| `--accent: #3d5afe` light, `#8fa2ff` dark | Retire. Generic indigo-blue is the default LLM accent, and it says nothing about this product. |
| Mixed radius system: `.6rem` cards, `.5rem` inputs, `999px` badges and filter chips | Retire. Shape Consistency Lock: one system, and it is 0. |
| `font: 16px/1.55 ui-sans-serif, system-ui` with no display face | Retire. No typographic voice at all. |
| Metadata strip `v1.0.0 · platform · updated 2026-08-30` | Retire the form. Two middle dots on one line; the ration is one. Becomes a hairline three-column strip. |
| Stale badge in amber `#d08700` | Retire the colour. A second hue breaks the Color Consistency Lock. Becomes a neutral outlined label. |
| Horizontal role filter chips above the grid | Replace with the left rail. Same behaviour, better use of the reference's structure, and it scales to seven roles without wrapping. |
| Centred `max-width: 60rem` single column | Widen to a rail plus a `max-width: 1400px` content well. |
| Search box, role filtering, recently-added, stale flag, install blocks, README render | **Keep.** All of it is doing real work. This is a reskin, not a re-architecture. |

## 5. Tokens

### 5.1 Colour

One accent. Red is reserved for interactive and brand moments: primary CTA
fills, the active rail item, focus rings, the hover edge on a tile. It is never
used for decoration and never for status.

```css
:root {
  --bg:        #FFFFFF;
  --surface:   #F7F7F7;   /* tile and input fill */
  --line:      #DFDFE0;   /* decorative hairline */
  --line-ui:   #8D8D8D;   /* input and button borders, 3.23:1 on white */
  --fg:        #222326;
  --muted:     #5A5A5A;
  --accent:    #E42300;   /* fills only */
  --accent-fg: #C11D00;   /* accent as text or link on light */
  --on-accent: #FFFFFF;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:        #141416;
    --surface:   #1C1D20;
    --line:      #34363A;
    --line-ui:   #6E7075;
    --fg:        #F2F2F3;
    --muted:     #A0A1A5;
    --accent:    #E42300;
    --accent-fg: #FF5A2E;  /* accent as text or link on dark */
    --on-accent: #FFFFFF;
  }
}
```

Contrast, computed:

| Pair | Ratio | Verdict |
| --- | --- | --- |
| `--on-accent` on `--accent` | 4.64:1 | AA normal text. Red CTA with white label is safe. |
| `--accent-fg` `#C11D00` on white | 6.06:1 | AA comfortably. Use this for red text, never `#E42300`. |
| `--accent` on `#141416` | 3.98:1 | Large text and graphics only. Hence `--accent-fg` on dark. |
| `--accent-fg` `#FF5A2E` on `#141416` | 5.93:1 | AA normal text. |
| `--muted` on `--bg`, light | 6.90:1 | AA. |
| `--muted` on `--bg`, dark | 7.08:1 | AA. |
| `--line` on white | 1.33:1 | Decorative only. Any border a user must perceive uses `--line-ui`. |

### 5.2 Type

Bridgestone's faces are proprietary, so this is a stated substitution, not a
claim of parity.

| Role | Face | Treatment |
| --- | --- | --- |
| Display | **Archivo Narrow** variable, weight axis 400 to 700 | Uppercase, `font-weight: 700`, `letter-spacing: -0.01em`, `line-height: 1.05` |
| Body | **Geist** | Sentence case, `line-height: 1.55`, `max-width: 68ch` |
| Mono | **Geist Mono** | Install commands, version numbers, plugin names, skill ids |

Mono is load-bearing here rather than decorative: half the catalog's content is
slash commands and shell lines, and they should read as the literal strings they
are.

Scale, fluid between 640px and 1400px:

```
display-xl   clamp(2.75rem, 1.6rem + 4.4vw, 5rem)     hero headline
display-l    clamp(1.75rem, 1.2rem + 2.2vw, 2.75rem)  section headline
display-m    1.25rem                                   tile title
body         1rem / 1.55
micro        0.75rem, uppercase, tracking 0.14em       rail labels, eyebrows
mono-sm      0.875rem                                  commands, versions
```

Fonts are self-hosted woff2 in `dist/site/fonts`, `font-display: swap`, with
`system-ui` fallbacks. No `<link>` to a font CDN: the site ships from GitHub
Pages behind org access control and should not hand a third party a request log
of who browsed it.

Two notes from building it. Archivo's variable font carries both a width and a
weight axis, but Fontsource ships one file per axis, so asking for condensed and
bold at once is not possible from that package. Archivo Narrow is condensed by
design and gives both in a single 19KB file, so that is what shipped. And the
real payload is 160KB across three faces, not the 50KB estimated below: Geist
and Geist Mono are 70KB each unsubsetted. Dropping the Geist body face for
`system-ui` would save 70KB and cost little, since the voice lives in the display
and mono faces. Worth doing if the catalog ever feels slow.

### 5.3 Shape, line, elevation

- **Radius: 0.** Everywhere. Tiles, inputs, buttons, badges, the search field,
  the rail. This is the redesign's signature and it is not negotiable per
  component.
- **No shadows.** Hierarchy comes from 1px rules and inverted bands. A shadow on
  a zero-radius industrial layout reads as a mistake.
- **Rules:** 1px `--line` for structure, 4px `--accent` for the active or hovered
  edge, 2px `--fg` under section headings.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96. Section padding
  `clamp(3rem, 6vw, 6rem)` block.

## 6. Layout

### 6.1 The role rail

The reference's fixed left icon rail becomes the role filter. Seven roles from
the fixed taxonomy, each an item with a micro-label; the active item carries a
4px red left edge and `--fg` text. This replaces the pill chips, uses the
reference's most recognisable structure, and gives roles a permanent home
instead of a row that wraps.

- Desktop `>= 1024px`: fixed, 76px wide, icon plus label, dark surface.
- Tablet `768px` to `1023px`: collapses to a horizontal scroll-snap strip under
  the search field, same visual language, still zero radius.
- Mobile `< 768px`: a `<select>` labelled "Filter by role". A rail is not worth
  a third of a phone screen.

Icons come from Phosphor, one family, `weight="regular"`, 20px, uniform stroke.
No hand-drawn SVG paths.

### 6.2 Grid

Content well `max-width: 1400px`, gutter `clamp(1rem, 4vw, 3rem)`.
Tile grid `repeat(auto-fill, minmax(19rem, 1fr))`, gap 1px on a `--line`
background so tiles read as one ruled sheet rather than floating cards. The
first tile of the sheet spans two columns on `>= 1024px`. That is the whole of
the asymmetry, which is what `DESIGN_VARIANCE: 6` should buy.

Amended after a UX audit of the shipped site: the catalog is **one sheet, one
tile per plugin**. The original per-role sections printed a multi-role plugin
once under each role, and with a small catalog the page became a wall of the
same card. Roles now live on the tile (an uppercase micro line under the title)
and in the rail filter, which hides tiles rather than switching sections. The
audit's other amendments: the utility nav carries the queue page, marks the
current page with the red underline, and marks the repository link as external;
the hero count blocks are links (skills and roles to the catalog, open requests
to the queue) with a pressed-darker hover fill `--accent-down: #C11D00`;
section `h2`s step down to `clamp(1.5rem, 1.15rem + 1.3vw, 2.125rem)` so the
`h1` owns the page; the two-paths CTAs bottom-align across the split; the
install band gets the same copy button the detail panels have; the detail
panel's tool caption is gone (the active tab already says it); stage counts on
the queue page render as an outlined chip, not a subscript numeral; form
checkboxes are 1.15rem with `accent-color: var(--accent)`; and "Recently added"
renders only from three entries up, because below that it repeats the catalog
card for card.

A second audit pass tightened the states and edges. The footer sits at the
viewport bottom on short pages (flex column on `body`), so the queue page's
unread state no longer floats over bare ground. The utility nav item for the
queue reads "Open requests" — the page's own title — instead of sitting next
to "Request a skill" as a near-duplicate, and on phones the nav is one
scrollable row in the tab strip's manner rather than a stack of wrapped lines.
Plugin pages carry a "← Catalog" crumb. The primary action is one recipe
(`.cta` and the submit button share fill, metrics and the `--accent-down`
hover). Duplicate-warning links open in a new tab with `rel="noopener"` and
say so, because that aside invites a look elsewhere and following it must not
cost the typed request. `#status.error` takes the same accent-ruled aside
treatment as the duplicate warning, so the form has one error vocabulary. The
lead tile's two-column span waits for a catalog of three, and the queue page's
intro speaks of examples, not of the line convention the form no longer shows.
Deliberately unchanged: the rail keeps its dark surface in both modes (it is
the reference's signature structure), and tile titles stay uppercase (the
display treatment is the voice of the whole site).

The last refinement pass: the hero instrument always reads three blocks — the
open-request count when the build read the queue, the tool count (the three
tools the lede names, linking to the install band) when it did not — so the
composition never depends on which build you are looking at. The catalog's
empty state carries a "Clear search and filter" action instead of being a
wall. Tile title tooltips list the keywords search also matches, so a match on
invisible text is explicable. Pages carry og: metadata for link unfurls, the
utility nav is labelled for assistive tech, and in-page anchor jumps glide
under prefers-reduced-motion: no-preference only. Accepted as-is with
rationale: white count labels on the accent fill measure 4.64:1 — AA with
little margin, monitored, not a failure.

Breakpoints stay `sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`.

## 7. Page compositions

### 7.1 Homepage

Six sections plus footer. Layout families are all different, so no family
repeats and the zigzag cap is not in play. Eyebrow budget is `ceil(6 / 3) = 2`,
and two are spent: one in the hero, one on the two-paths section — which is why
the requests band below carries none.

1. **Hero, asymmetric split.** Left: eyebrow, headline (2 lines max), subtext
   (20 words max), search field. Right: a red block carrying the live counts
   (plugin total and role count) in display type. A "newest" date tile shipped
   here originally and was removed: a date is not a count, and it made the block
   read as a changelog. Four text
   elements, nothing below the CTA, no trust strip, no scroll cue, top padding
   capped at `pt-24`.
2. **Recently added, horizontal scroll-snap row.** Breadth without a second
   grid. Hidden below three entries rather than shown as a stub or an echo of
   the catalog.
3. **Catalog: rail plus one tile sheet.** The page's centre of gravity. One
   "Catalog" heading at `display-l` with a 2px underrule, one tile per plugin,
   roles as a micro line on the tile. Search and role filter compose: both act
   on tiles, and a single empty state speaks when nothing matches.
4. **Install once, inverted full-bleed band.** Near-black, the two marketplace
   commands in mono at `display-m`, one red CTA. This is the page's one moment
   of scale.
5. **Two paths, 2-up asymmetric split.** Contribute a plugin (60%) and request
   one (40%). Not three equal cards. Each path gets one CTA, and the two labels
   are distinct intents, so the duplicate-intent rule holds.
6. **Requests in flight, ruled list.** Directly after the two paths, because
   that is the moment a reader wonders whether someone has already asked. Up to
   four open requests, one line each, with a neutral stage chip and a link to
   the full queue. No eyebrow (the budget is spent) and not inverted (both
   inverted bands are already claimed). Hidden entirely when the queue is empty
   or was never read, the same rule "Recently added" follows.
7. **Footer, inverted.** Repo link, request link, the generator line.

Two inverted bands, both deliberate, both at section scale, both using the same
token set flipped. Page theme lock holds: the page follows
`prefers-color-scheme`, and the bands invert within whichever mode is active
rather than pinning one section to a fixed palette.

### 7.2 Plugin detail

Title block (name in display, one-line description, stale label if applicable),
then a **facts rule table**: version, owner, roles, last updated, skills. Rules
between rows only, no border on every side, no dots as separators.

Install is a four-tab block (Claude Code, Copilot, Codex, universal). Tabs
because four stacked command blocks bury the README, and because a reader wants
exactly one of the four. Each command sits in a mono block with a copy button;
the copy button is the only place a second interactive colour would tempt us,
and it does not get one.

README renders below at `max-width: 68ch`, with generated headings picking up
the display face so a plugin page reads as one document.

### 7.3 Request page

Structurally as-is, restyled: zero radius, `--line-ui` borders on every field so
inputs are perceivable, labels above inputs, helper text present, error text
below. Status messages use `--fg` for progress and `--accent-fg` for errors,
which clears AA on both backgrounds.

Amended again after the UX audit: the examples field is no longer one free-text
box with a line convention to learn. It is a list of structured pairs — a
Scenario field and an Expected result field per example, an outlined ghost
button to add another, a Remove control on every example past the first, and
renumbering as examples come and go. The page composes the
`Scenario:`/`Expected:` text the generating agent parses at hand-off, so the
format cannot be malformed and validation now speaks about content ("Example 2
has a scenario but no expected result"), never about syntax.

Validation itself speaks in one voice: the form is `novalidate`, so the
browser's own bubble never competes with the status line, and every fault
focuses and scrolls to the control it names, marking it `aria-invalid` with an
accent border that clears on input. "Every field is required" is said once at
the top rather than discovered failure by failure. The duplicate-skill
interstitial, which renders beside the title field, scrolls itself into view
and hands focus to the first match when the submit button a screen below
raises it. The hand-off consequence is restated at the point of action: a hint
under the button says GitHub's prefilled form opens in a new tab and nothing
is filed until Create is pressed there.

Amended after this design was written: the token field described here no longer
exists. The form asks for no credential and hands its answers to GitHub's own
prefilled issue form, so the status region reports the hand-off rather than an
API result. The styling contract above is unchanged.

### 7.4 Open requests

The queue page, `requests.html`. A `.detail` frame like the other secondary
pages, then one ruled list per stage in the order **Needs triage**, **Approved
and generating**, **Possible duplicate** — the stage waiting on a human first.
Stage headings take the same 2px underrule as role headings. An empty stage is
omitted rather than shown at zero.

Stage chips are the outlined neutral label already used for **Stale**, not a
colour. The colour lock holds: one accent, reserved for interactive moments, so
status is carried by neutral treatment rather than a second hue. A red
"generating" chip would read as an alert and spend the accent on something
nobody can click.

Each entry is a heading link, an uppercase roles line in display type, the
problem statement as plain text, and `#number` with the open date. Issue text is
escaped and never rendered as markdown — this is the one page whose content has
not been through code review.

Two states other than the list, and they say different things: *"this build did
not read the queue"* when there was no token, and *"no open requests right now"*
when there was one and the queue was empty. The page carries no JavaScript.

## 8. Motion

`MOTION_INTENSITY: 4`, and motion is claimed only where it is shown. No React,
no Motion, no GSAP in this project: the site is static HTML from a TypeScript
generator, so the honest tools are CSS transitions and IntersectionObserver.

| Moment | Spec | Why it exists |
| --- | --- | --- |
| Hero entry | opacity 0 to 1, `translateY(8px)` to 0, 400ms, `cubic-bezier(0.16, 1, 0.3, 1)` | Hierarchy: the headline arrives before the grid. |
| Tile reveal | IntersectionObserver, `once`, 60ms stagger within a row, same easing | Storytelling: the sheet assembles as you scroll to it. |
| Tile hover | left edge `scaleX(0)` to `scaleX(1)`, 180ms | Feedback: which tile is under the cursor. |
| Button press | `translateY(1px)` on `:active` | Feedback: physical acknowledgement. |
| Filter change | 120ms opacity only, no layout animation | State transition, and animating layout on a 200-tile grid janks. |

No `window.addEventListener("scroll")`. Every rule above collapses to instant
under `prefers-reduced-motion: reduce`, which is mandatory above intensity 3.

## 9. Accessibility

- Contrast table in 5.1 is the contract. Body text AA, hero copy AAA where the
  scale allows.
- Focus: 2px `--accent` outline with 2px offset, never `outline: none`.
- The rail is a `<nav>` with `aria-pressed` on each role toggle; the mobile
  `<select>` is labelled, not a bare control.
- Search results announce via a polite live region, so filtering is not a silent
  change for screen reader users.
- Tile titles are the link; the whole tile is clickable through a stretched
  pseudo-element rather than nested interactive elements.
- Every command block is selectable text, not an image, and the copy button has
  a visible label rather than an icon alone.

## 10. Implementation plan

All of it lands in the generator, not in a new stack.

| Step | File | Nature |
| --- | --- | --- |
| 1. Replace the token block and component CSS | `packages/cli/src/site.ts`, `STYLES` | Mechanical |
| 2. Emit self-hosted fonts into `dist/site/fonts` | `generateSite` in `site.ts` | New asset step, small |
| 3. Rail markup plus mobile `<select>`, replacing `.filters` chips | `homePage`, and the filter script | Judgement |
| 4. Tile markup: span rule, hairline metadata strip, neutral stale label | `card` | Mechanical |
| 5. Facts rule table and install tabs | `pluginPage` | Judgement |
| 6. Restyle form, keep behaviour | `requestPage` | Mechanical |
| 7. Update HTML assertions | `packages/cli/test/build.test.ts` | The `data-role-filter` and role-heading assertions move to the rail. Index-shape tests do not change. |

The JSON index contract, the manifests, the marketplace files and the validation
gate are all untouched. If a test outside `build.test.ts`'s HTML assertions goes
red, the redesign has overreached.

## 11. Pre-flight check

Ticked against this design, not against a future implementation.

- [x] Design read declared, mode detected, reference audited against the live site
- [x] Dials explicit and reasoned, not baseline defaults
- [x] Aesthetic labelled honestly: substituted display face, no claim of brand parity
- [x] Zero em-dashes in this document and in every string it specifies
- [x] Page theme lock: one auto theme, two deliberate inverted bands
- [x] Colour consistency lock: one accent, status carried by neutral treatment
- [x] Shape consistency lock: radius 0, no exceptions
- [x] Button contrast: 4.64:1 white on red, verified
- [x] Form contrast: `--line-ui` at 3.23:1 for every perceivable border
- [x] No serif, so the serif ban is not engaged
- [x] Hero fits the viewport: 2-line headline, 20-word subtext, `pt-24` cap, 4 text elements
- [x] Eyebrow count 2 against a budget of 2
- [x] No split-header pattern, no zigzag run, no duplicate CTA intent
- [x] Six sections, six different layout families
- [x] No fake screenshots, no hand-rolled decorative SVG, no stock photography as filler
- [x] No scroll cues, no locale strips, no version footers, no section-number eyebrows, no decorative status dots
- [x] Middle dot rationed: metadata strip rebuilt as columns
- [x] Motion motivated line by line, reduced motion mandatory, no scroll listeners
- [x] Mobile collapse stated per component
- [x] Icons from one library, no hand-drawn paths

## 12. The one open decision

**Self-host Archivo and Geist, or stay on system fonts?** Resolved: self-hosted,
latin subset, `font-display: swap`, display face preloaded. The measured cost is
160KB rather than the 50KB estimated, split 19KB display and 70KB each for body
and mono. See the note in 5.2 if that becomes a problem.
