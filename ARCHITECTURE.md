# Custom STL Creator — Architecture Plan

## Overview

A browser-based tool for generating customized, multi-color STL files for 4-color printers
(e.g., Snapmaker J1/J1s). Users pick a design, fill in customization fields, preview in a 3D
viewer with color regions, and download one STL per color channel.

---

## Tech Stack

| Concern | Library | Why |
|---|---|---|
| 3D rendering / viewer | [Three.js](https://threejs.org/) | Industry standard, large ecosystem |
| Geometry / CSG | [JSCAD](https://openjscad.xyz/) | JavaScript-native parametric CAD, exports STL |
| Text → 3D outlines | [opentype.js](https://opentype.js.org/) | Turns TTF/OTF glyph paths into polygon outlines |
| STL export | `@jscad/stl-serializer` | Part of JSCAD ecosystem, binary STL output |
| Styling | Vanilla CSS (CSS custom properties) | Zero build step, easy to override per design |
| Bundling (optional) | Vite | Fast dev server + ES module bundling if project grows |

No framework lock-in — everything is plain ES modules so designs are just `.js` files dropped into a folder.

---

## File & Folder Structure

```
/
├── index.html                  ← Design picker landing page
├── viewer.html                 ← Shared 3D viewer + export page
├── css/
│   └── styles.css
├── js/
│   ├── core/
│   │   ├── viewer.js           ← Three.js scene, camera, orbit controls
│   │   ├── color-manager.js    ← Color region UI + live recolor in viewer
│   │   ├── ui-builder.js       ← Builds input form from a design's config
│   │   ├── stl-exporter.js     ← Calls JSCAD serializer, triggers download
│   │   └── design-registry.js  ← Master list of all available designs
│   └── designs/
│       ├── basketball-jersey/
│       │   ├── config.js       ← Metadata, input defs, color region defs
│       │   └── geometry.js     ← Parametric geometry generator
│       └── [your-next-design]/
│           ├── config.js
│           └── geometry.js
├── fonts/
│   └── college-block.ttf       ← (or any sporty TTF for jersey numbers)
└── assets/
    └── thumbnails/
        └── basketball-jersey.png
```

---

## Design Module Contract

Every design is a pair of files: `config.js` and `geometry.js`.

### `config.js` — what a design declares

```js
// js/designs/basketball-jersey/config.js
export default {
  id: "basketball-jersey",
  name: "Basketball Jersey",
  description: "Flat jersey plaque with player name and number.",
  thumbnail: "/assets/thumbnails/basketball-jersey.png",

  // ── Inputs rendered as form fields ──────────────────────────────────────
  inputs: [
    {
      id: "playerName",
      type: "text",
      label: "Player Name",
      default: "SMITH",
      maxLength: 12,
    },
    {
      id: "number",
      type: "number",
      label: "Jersey Number",
      default: 23,
      min: 0,
      max: 99,
    },
    {
      id: "jerseyStyle",
      type: "select",
      label: "Jersey Style",
      options: ["NBA Classic", "College", "Retro"],
      default: "NBA Classic",
    },
  ],

  // ── Color regions (one STL per region for multi-color printing) ──────────
  colorRegions: [
    { id: "body",   label: "Jersey Body",    default: "#C8102E" }, // Cavaliers red
    { id: "text",   label: "Name & Number",  default: "#FFFFFF" },
    { id: "trim",   label: "Trim / Outline", default: "#041E42" },
  ],

  // ── Printer settings ─────────────────────────────────────────────────────
  printer: {
    maxColors: 4,
    bedSize: { x: 160, y: 160 },   // mm, Snapmaker J1 bed
    defaultLayerHeight: 0.2,
  },
};
```

### `geometry.js` — what a design generates

```js
// js/designs/basketball-jersey/geometry.js
import * as jscad from "@jscad/modeling";
import opentype from "opentype.js";

/**
 * @param {Object} inputs   — key/value from the form (matches config.inputs ids)
 * @returns {Object}        — { regionId: JscadGeometry }
 *
 * Each key maps to a colorRegion id in config.js.
 * The core system merges these into a Three.js scene and handles export.
 */
export async function generate(inputs) {
  const { playerName, number, jerseyStyle } = inputs;

  const body   = buildJerseyBody(jerseyStyle);
  const text   = await buildText(playerName, number);
  const trim   = buildTrim(body);

  return {
    body,   // maps to colorRegion "body"
    text,   // maps to colorRegion "text"
    trim,   // maps to colorRegion "trim"
  };
}
```

This contract is the only thing the core system cares about.
Adding a new design = create a new folder + these two files + register it.

---

## Core System Responsibilities

### `design-registry.js`
```js
import basketballJersey from "./designs/basketball-jersey/config.js";
// Add new designs here — that's the only place you touch to register one
export const designs = [
  basketballJersey,
  // myNewDesign,
];
```

### `ui-builder.js`
- Reads `config.inputs` → renders `<input>`, `<select>`, `<textarea>` etc.
- On any change → debounces → calls `generate(inputs)` → updates viewer.

### `viewer.js`
- Three.js scene with `OrbitControls` (rotate, zoom, pan).
- Receives a `{ regionId: geometry }` object.
- Renders each region as a separate `THREE.Mesh` so colors are independent.
- Shows a grid floor for scale reference.
- Smooth shading via `BufferGeometry.computeVertexNormals()`.

### `color-manager.js`
- Renders a color swatch per `colorRegion`.
- Picking a color calls `mesh.material.color.set(hex)` on the matching mesh.
- Default colors come from `config.colorRegions[].default`.

### `stl-exporter.js`
- Converts each JSCAD geometry → binary STL buffer.
- Downloads one `.stl` per color region (e.g., `jersey-body.stl`, `jersey-text.stl`).
- Snapmaker J1 workflow: import all STL files, assign filament color per file.

---

## Basketball Jersey — Geometry Detail

```
Top-down view (flat plaque approach — printable on any FDM printer):

  ┌──────────────────────────┐  ← 2mm base layer (color: body)
  │   ╔══════════════════╗   │
  │   ║  23  ║  SMITH    ║   │  ← 1.5mm raised text (color: text)
  │   ╚══════════════════╝   │
  │  [jersey silhouette cut] │
  └──────────────────────────┘

Layers (Z):
  0–2mm   : jersey body (+ optional side trim rails)
  2–3.5mm : extruded number (front, large, bold)
  2–3.5mm : extruded name (bottom strip)
  0–3.5mm : trim outline (thin border following jersey edge)
```

**Text rendering pipeline:**
1. Load TTF via `opentype.js` → get glyph paths as Bezier curves
2. Convert to 2D polygon (sample Bezier at ~0.2mm resolution)
3. JSCAD `extrudeLinear({ height: 1.5 })` → solid letter bodies
4. Union letters into one solid → assign to `text` region

**Jersey silhouette:**
- Built from JSCAD polygon points (shoulder curve, side cuts, collar)
- Parametric — `jerseyStyle` input shifts the shoulder width / collar shape

---

## Multi-Color Print Workflow (Snapmaker J1/J1s)

```
Website exports:          Snapmaker Luban:
  jersey-body.stl    →    Load → assign Extruder 1 (red)
  jersey-text.stl    →    Load → assign Extruder 2 (white)
  jersey-trim.stl    →    Load → assign Extruder 3 (navy)

All three align at origin (0,0,0) — they print in-register on the same bed.
```

The site should show a clear "How to print" modal per design explaining
exactly which STL goes to which extruder.

---

## Extending the System — Adding a New Design

1. Create `/js/designs/your-design-id/config.js` — fill in the template above.
2. Create `/js/designs/your-design-id/geometry.js` — implement `generate(inputs)`.
3. Add a thumbnail to `/assets/thumbnails/`.
4. Register it in `design-registry.js` (one import + one array entry).

That's it. The rest of the UI (form, viewer, color swatches, export) is automatic.

---

## Phased Build Plan

### Phase 1 — Core Infrastructure
- [ ] `index.html` design picker grid
- [ ] `viewer.html` layout (sidebar form + 3D canvas + color swatches + export buttons)
- [ ] `viewer.js` — Three.js scene setup
- [ ] `ui-builder.js` — dynamic form from config
- [ ] `color-manager.js` — live recolor
- [ ] `stl-exporter.js` — download STLs

### Phase 2 — First Design: Basketball Jersey
- [ ] `basketball-jersey/config.js`
- [ ] `basketball-jersey/geometry.js` — jersey body silhouette
- [ ] Text extrusion pipeline (opentype.js → JSCAD)
- [ ] Smooth beveled edges on text for a premium feel
- [ ] "How to print" modal

### Phase 3 — Polish & UX
- [ ] Live preview updates as user types (debounced, ~400ms)
- [ ] Loading spinner during geometry generation
- [ ] Mobile-friendly layout
- [ ] Preset color palettes (NBA teams, college teams)

### Phase 4 — Second Design (validates extensibility)
- [ ] Pick a second design to confirm the plugin architecture works cleanly

---

## How to Prompt for New Designs

### Recommended Model
Use **Claude Sonnet** (claude-sonnet-4-5 or newer) for new design implementations.
It handles the mix of geometric reasoning + JavaScript well within a single context.
Use **Claude Opus** only if the geometry is unusually complex (e.g., a full figurine
with organic curves) — it's slower but better at spatial reasoning for hard shapes.

### Prompt Template for New Designs

Copy and paste this when you want a new design added:

---

```
I want to add a new design to the Custom STL Creator.

**Design name:** [e.g., "Football Helmet Keychain"]
**Description:** [1–2 sentences about what it is]

**Inputs the user should be able to customize:**
- [input name]: [type: text | number | select | boolean] — [description, valid range or options]
- ...

**Color regions (for multi-color printing):**
- [region name]: [default hex color] — [what this region covers]
- ...

**Geometry description:**
Describe the 3D shape in plain language. Be specific about:
- Overall dimensions (mm)
- What is raised/engraved vs flat
- How text or logos appear
- Any curved or organic features
- Layer order (what sits on top of what)

**Reference images or sketches:** [attach if you have them]

**Special requirements:** [e.g., "must be printable without supports", "text must be at least 3mm tall to be readable"]

Please create the config.js and geometry.js files following the architecture in ARCHITECTURE.md,
register the design, add a placeholder thumbnail, and push to the branch.
```

---

### Tips for Better Results
- **Give dimensions in mm** — "about the size of a credit card" is vague; "85mm × 54mm × 3mm" is actionable.
- **Specify minimum wall thickness** — for FDM printing, nothing thinner than 1.2mm (2–3 perimeters).
- **Name color regions clearly** — "background", "text", "outline" beats "color1", "color2".
- **Mention the Snapmaker J1 bed limit** — 160mm × 160mm × 150mm. Designs larger than that need to be split.
- **Attach reference photos** — Claude can analyze images and translate them into geometry parameters.
