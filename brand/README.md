# Handoff: mneme — brand system v1.0

## Overview

This bundle is the **mneme** brand identity: logo, colour, type, spacing, and voice.
It is everything you need to apply the brand consistently across a website, a
desktop/mobile app, a browser extension, an SDK landing page, marketing pages,
or any other surface for the product.

mneme is the open, user-sovereign memory layer for AI. The visual identity
reflects that: warm, matte, slightly editorial — the opposite of slick AI-SaaS
tropes. Paper background, deep ink, one warm orange accent, subtle grain.

## About the design files

The files in this bundle are **design references** — a polished HTML brand
reference page (`brand-reference.html`) plus standalone asset files.

The HTML page is NOT production code to copy directly. It is the canonical
visual spec — pixel-accurate examples of every brand element, with the exact
tokens and components used to build them.

Your task is to **apply this brand system inside the target codebase's
existing environment** (Next.js, Astro, Vite + React, SwiftUI, Tailwind,
shadcn/ui, plain CSS — whatever the project uses). If there is no codebase
yet, choose the most appropriate framework for what's being built (a marketing
site, an SDK doc site, a desktop app, etc.) and implement there.

Drop `./tokens.css` in directly; reference the SVGs from this folder; or
translate the token values into the project's own system (Tailwind config,
Stitches theme, design-tokens-style JSON, etc.).

## Fidelity

**High-fidelity.** Every colour, font, size, radius, spacing value, and the
mark itself are final. Implement pixel-accurately. The grain texture on
surfaces and on the mark is part of the brand — do not strip it.

## The brand at a glance

- **Identity**: mneme — the open memory layer for AI
- **Voice**: direct, plainspoken, slightly editorial. No "revolutionary," no
  "AI-powered," no marketing fluff. When we make a claim, we name a mechanism.
- **Look**: matte, grainy, warm. Paper + ink + one orange. No gradients,
  no glossy shadows, no neon.
- **Type**: Instrument Serif (display + wordmark), Newsreader (body),
  Space Grotesk (UI/labels), JetBrains Mono (code).

## The mark

`./mneme-mark.svg` — primary mark, built on a 512×512 grid.

**Construction**

Three stacked rounded bars (`rx = 16`), top to bottom:

| Bar     | x   | y   | width | height | fill    |
| ------- | --- | --- | ----- | ------ | ------- |
| Top     | 168 | 128 | 176   | 72     | #E0651D |
| Middle  | 128 | 232 | 256   | 72     | #15110F |
| Bottom  | 96  | 336 | 320   | 72     | #15110F |

Vertical gap between bars: 32. Bars centre on x = 256.

A grain layer is multiplied over the bars at 55% opacity using SVG
`feTurbulence` (`baseFrequency = 1.4`, `numOctaves = 2`, `seed = 1`,
`stitchTiles = "stitch"`), clipped to the bar silhouette. This is the
matte texture — never ship the mark as flat fills only.

**Variants in this folder**

- `mneme-mark.svg` — primary (ink + orange, with grain)
- `mneme-mark-inverse.svg` — for ink-coloured surfaces
- `mneme-mark-mono.svg` — single-colour, `fill="currentColor"` — use this
  inside `<button>`, navigation, or anywhere the colour should follow text
- `mneme-lockup-horizontal.svg` — mark + wordmark, horizontal
- `mneme-wordmark.svg` — wordmark only (Instrument Serif)

**Rules**

- Clearspace = the height of one bar (~14% of mark height) on all four sides
- Minimum sizes: 24px square in UI · 16px for favicon only (drop the grain) ·
  10mm in print
- Never recolour, rotate, squash, or add drop-shadow

## Colour

The palette is in `./tokens.css` as CSS custom properties and in
`./tokens.json` as machine-readable tokens. Hex values:

**Core**
- Ink `#15110F` — primary text on paper, dark surfaces, mark
- Orange `#E0651D` — primary action, accent only (never a body-text background)
- Paper `#F2ECE0` — primary background
- Cream `#FAF6EE` — lift, dialog, card

**Extended neutrals**
- Ink-soft `#3D342C` — secondary text
- Ink-mute `#8A7A6A` — labels, captions
- Ink-line `#D9CFBD` — hairline rules, dividers
- Paper-2 `#EBE3D4` — inset row, hover, card on paper
- Paper-3 `#E2D8C5` — pressed

**Accent extensions**
- Orange-deep `#B8481A` — hover/pressed for primary action
- Orange-soft `#F3A06B` — tint, illustration
- Orange-wash `#FBE1CB` — badge background

**Dark surfaces**
- Ink-bg `#1A1714` — primary dark surface
- Ink-bg-2 `#221E1A` — dark card
- Ink-bg-3 `#2C2722` — dark hover
- On-ink `#F2ECE0` — text on dark
- On-ink-mute `#AD9A82` — secondary text on dark

**Status (use sparingly, keep matte)**
- Good `#4F7A4A` — synced, success
- Warn `#C28A1E` — caution
- Bad `#B23A2A` — error, destructive

**Surface rule**: every primary brand surface carries a subtle SVG noise
overlay (`feTurbulence baseFrequency 0.85`, multiplied at ~8–10% opacity).
This is the brand signature. The implementation pattern is shown in
`brand-reference.html` (`body::before` block) and copied below in
**Implementation notes**.

## Typography

Load via Google Fonts:

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital,wght@0,400;0,500;1,400&family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
```

**Families and roles**

- **Instrument Serif** — display, hero headings, the wordmark. Always
  lowercase for the wordmark, tracking `-0.02em`. Italics used editorially
  on emphasis words.
- **Newsreader** — long-form body, briefs, narrative pages, lede paragraphs.
- **Space Grotesk** — UI body, buttons, labels, captions, metadata,
  navigation. Weights 400 / 500 / 600.
- **JetBrains Mono** — code, tokens, telemetry, terminal output.

**Type scale** (CSS vars in `tokens.css`)

| Token   | Size  | Line-height | Use                         |
| ------- | ----- | ----------- | --------------------------- |
| 5xl     | 96px  | 1.0         | hero display                |
| 4xl     | 64px  | 1.05        | display                     |
| 3xl     | 44px  | 1.1         | page heading                |
| 2xl     | 32px  | 1.2         | section heading             |
| xl      | 24px  | 1.3         | card title, lede            |
| lg      | 19px  | 1.45        | lede paragraph              |
| base    | 16px  | 1.5         | default body                |
| sm      | 13px  | 1.5         | UI body, captions           |
| xs      | 11px  | 1.4         | eyebrow, meta, label (uppercase + 0.22em tracking) |

**Tracking tokens**
- `tight` `-0.025em` — display
- `snug`  `-0.015em` — large body
- `wider` `0.22em` — eyebrow labels (always uppercase)

## Spacing and geometry

**Spacing scale** (4px base): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128

Lean toward the larger steps (24/32/48) for breathing room. Tight density
is reserved for data-dense UI lists.

**Radii**
- `sm` 4px — inputs, badges
- `md` 8px — buttons, fields
- `lg` 14px — cards, panels
- `xl` 22px — app icons, dialogs
- `pill` 999px — chips, avatars

**Elevation**: the brand is matte. Use shadows sparingly.
- `--mneme-shadow-1: 0 1px 0 rgba(21,17,15,0.04)` — hairline lift
- `--mneme-shadow-2: 0 6px 18px -10px rgba(21,17,15,0.18)` — card pop on paper
- `--mneme-shadow-pop: 0 14px 32px -12px rgba(224,101,29,0.32)` — accent only

**Motion**: ease `cubic-bezier(0.2, 0.7, 0.2, 1)`, durations 120 / 200 / 360 ms.

## Components

Reference implementations live in `brand-reference.html`, section 06 (In
application). Recreate these in the target codebase's component system:

- **Primary button** — orange fill, cream text, `md` radius, 10×16 padding,
  hovers to orange-deep
- **Ghost button** — transparent fill, ink-line border, hovers to paper-2
- **Dark button** — ink fill, cream text (for code/terminal contexts)
- **Badge** — orange-wash background, orange-deep text, pill radius, 11px
  Space Grotesk, uppercase, 0.04em tracking
- **Card** — cream background, ink-line border, `lg` radius, 24–32px padding
- **List row** — paper-2 background, 10px radius, 14×16 padding, mark + title
  (Space Grotesk 500) + meta (Newsreader italic 13px)
- **Dark banner** — ink-bg background, on-ink text, Instrument Serif display
  headline with orange-soft italic accent on one phrase, eyebrow above
- **Browser tab / favicon** — 16px mark (drop grain at this size)
- **App icon** — 96px square, `xl` radius, mark at ~60px inside

## Voice

**Sounds like us**
- "Your memory. Your keys. Every model."
- "Memory that belongs to you."
- "Stored on your device. Synced when you choose."
- "Open protocol. Client-held keys. Cross-provider."

**Not us**
- "Revolutionary AI-powered memory platform"
- "Unlock the power of your context"
- "The future of personal AI is here"
- "Seamlessly leverage your data"

**Rules**: short sentences. Concrete nouns. Lowercase product name in running
text. Italic emphasis on one word per sentence at most.

## Implementation notes

**1. Tokens**

Drop `./tokens.css` into the project and import it in the root
stylesheet, or translate to the target system (e.g. Tailwind `theme.extend`,
Stitches theme, Style Dictionary). All tokens use the `--mneme-*` prefix.

**2. Mark**

For React/Vue/Svelte: paste the SVG markup inline as a component so the
grain filter ID can be scoped per-instance if more than one mark renders
on the same page (otherwise the second instance won't render the grain).
Alternatively `<img src="/assets/mneme-mark.svg" />` for static surfaces.

For dark surfaces use `mneme-mark-inverse.svg`. For arbitrary tinting (e.g.
in buttons that change colour on hover) use `mneme-mark-mono.svg` which
uses `fill="currentColor"`.

**3. Surface grain**

Add this to the global stylesheet so every paper surface picks up the
brand's signature texture. The data-URI keeps it self-contained.

```css
body::before {
  content: '';
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 100;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='280' height='280'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
  mix-blend-mode: multiply;
  opacity: 0.10;
}
```

For dark surfaces, change `mix-blend-mode: multiply` → `screen` and opacity
to `0.05`.

**4. Wordmark**

Render as live text, not as a path:

```html
<span style="font-family: 'Instrument Serif', serif;
             font-size: 96px;
             letter-spacing: -0.02em;
             color: var(--mneme-ink);">mneme</span>
```

Always lowercase. The `mneme-wordmark.svg` file is for places where a webfont
can't be guaranteed (e.g. raster favicons, OG images).

## Files in this bundle

```
brand/
├── README.md                       ← you are here
├── brand-reference.html            ← canonical visual reference (open in a browser)
├── mneme-mark.svg                  ← primary mark
├── mneme-mark-inverse.svg          ← for dark surfaces
├── mneme-mark-mono.svg             ← single-colour, currentColor
├── mneme-lockup-horizontal.svg     ← mark + wordmark
├── mneme-wordmark.svg              ← wordmark only
├── tokens.css                      ← CSS custom properties (drop-in)
└── tokens.json                     ← machine-readable token spec
```

Open `brand-reference.html` in a browser at any time to verify your
implementation against the canonical visual spec.
