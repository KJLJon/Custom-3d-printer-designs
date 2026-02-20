# CLAUDE.md — Custom STL Creator

Developer and AI context for this repository. Read this before making changes.

---

## What This Project Is

A browser-based tool for generating customized, multi-color STL files for 4-color FDM printers
(primarily the Snapmaker J1/J1s). Users pick a design, fill in form fields, preview a live 3D
render, and download one STL file per color region.

No build step. No framework. Pure ES modules served as static files.

---

## Repository Map — Where Key Files Live

```
/
├── CLAUDE.md                        ← You are here
├── ARCHITECTURE.md                  ← Full technical specification (read this too)
├── README.md                        ← Public-facing project description
├── index.html                       ← Landing page; auto-populates design cards from registry
├── viewer.html                      ← 3D viewer + customization sidebar + export UI
│
├── css/
│   └── styles.css                   ← Entire design system (dark theme, CSS custom properties)
│
├── js/
│   ├── core/                        ← Engine — JS developer touches these for platform changes
│   │   ├── design-registry.js       ← ★ REGISTER NEW DESIGNS HERE (one line per design)
│   │   ├── viewer.js                ← Three.js scene, camera, OrbitControls, JSCAD→mesh bridge
│   │   ├── color-manager.js         ← Color picker UI; reads colorRegions from config
│   │   ├── ui-builder.js            ← Dynamic form builder; reads inputs from config
│   │   └── stl-exporter.js          ← JSCAD→binary STL; triggers browser download
│   │
│   └── designs/                     ← Each design is a self-contained folder here
│       └── basketball-jersey/
│           ├── config.js            ← Design metadata, inputs, color regions, print guide
│           └── geometry.js          ← Parametric geometry generator (async, returns JSCAD geoms)
│
├── assets/
│   └── thumbnails/                  ← PNG thumbnails shown on the index landing page
│       └── basketball-jersey.png    ← (placeholder — file doesn't exist yet)
│
└── fonts/                           ← Local TTF fallbacks (currently unused; fonts load from CDN)
```

### Quick-Reference: What to Edit for Common Tasks

| Task | File(s) |
|------|---------|
| Add a new design | `js/designs/<id>/config.js` + `js/designs/<id>/geometry.js` + `js/core/design-registry.js` |
| Change a design's form fields | `js/designs/<id>/config.js` → `inputs` array |
| Change a design's color regions | `js/designs/<id>/config.js` → `colorRegions` array |
| Change 3D geometry / shape | `js/designs/<id>/geometry.js` → `generate()` function |
| Fix viewer rendering or camera | `js/core/viewer.js` |
| Fix color picker behavior | `js/core/color-manager.js` |
| Fix form input rendering | `js/core/ui-builder.js` |
| Fix STL download | `js/core/stl-exporter.js` |
| Change global styles / layout | `css/styles.css` |
| Change landing page structure | `index.html` |
| Change viewer page structure | `viewer.html` |

---

## How the System Works Together

```
index.html
  └── imports design-registry.js
        └── imports config.js (for each design)
              → renders design cards (name, description, thumbnail, color swatches)
              → each card links to viewer.html?design=<id>

viewer.html
  ├── imports design-registry.js → finds the active config by URL param
  ├── imports ui-builder.js      → reads config.inputs → renders form fields
  ├── imports color-manager.js   → reads config.colorRegions → renders color pickers
  ├── imports viewer.js          → initializes Three.js scene
  └── on form change (debounced 400ms):
        → calls geometry.js generate(inputs)
              → returns { regionId: JscadGeometry, … }
        → viewer.js converts each JSCAD geometry → THREE.Mesh
        → color-manager.js applies current hex colors to each mesh
        → stl-exporter.js (on button click) serializes each mesh → binary STL → download
```

**Data flow summary:**
1. `config.js` declares *what* a design has (fields, colors, metadata).
2. `geometry.js` *generates* the 3D geometry from current field values.
3. Core modules (`viewer`, `color-manager`, `ui-builder`, `stl-exporter`) are fully generic —
   they never know which design they're running; they only speak the contract.

---

## The Design Contract

Every design is exactly two files. The core system cares about nothing else.

### `config.js` — Design Declaration

```js
// js/designs/<your-design-id>/config.js
export default {
  id: 'your-design-id',          // must match the folder name; used in URLs and filenames
  name: 'Human Readable Name',
  description: 'One sentence shown on the index card.',
  thumbnail: 'assets/thumbnails/your-design-id.png', // null until image exists

  // ── Form fields rendered in the sidebar ─────────────────────────────────
  inputs: [
    // Supported types: text | number | select | checkbox | range | textarea
    {
      id: 'fieldId',         // used as key in the inputs object passed to generate()
      type: 'text',
      label: 'Display Label',
      default: 'DEFAULT',
      maxLength: 14,
      placeholder: 'hint inside box',
      hint: 'Shown below the field.',
    },
    {
      id: 'size',
      type: 'range',
      label: 'Size',
      default: 3,
      min: 1,
      max: 10,
      step: 0.5,
      unit: ' mm',
    },
    {
      id: 'style',
      type: 'select',
      label: 'Style',
      options: ['Option A', 'Option B', 'Option C'],
      default: 'Option A',
    },
    {
      id: 'enabled',
      type: 'checkbox',
      label: 'Enable feature',
      default: true,
    },
  ],

  // ── Color regions — one STL file exported per region ────────────────────
  colorRegions: [
    { id: 'body',  label: 'Main Body',  default: '#C8102E' },
    { id: 'text',  label: 'Text',       default: '#FFFFFF' },
    { id: 'trim',  label: 'Trim',       default: '#041E42' },
    // Add up to 4 for the Snapmaker J1 (maxColors: 4)
  ],

  // ── Printer constraints shown in UI and used for validation ─────────────
  printer: {
    maxColors: 4,
    bedSize: { x: 160, y: 160 },  // mm — Snapmaker J1 bed
    defaultLayerHeight: 0.2,
    minWallThickness: 1.2,
  },

  // ── HTML shown in the "How to Print" panel ──────────────────────────────
  printGuide: `
    <ol>
      <li>Download all STL files.</li>
      <li>Open Snapmaker Luban → new multi-color project.</li>
      <li>Import each STL and assign it to an extruder by color.</li>
      <li>Slice at 0.2mm. No supports needed.</li>
    </ol>
  `,
};
```

---

### `geometry.js` — Geometry Generator

```js
// js/designs/<your-design-id>/geometry.js

// CDN imports (no build step needed)
const JSCAD_URL    = 'https://esm.sh/@jscad/modeling@2.12.0';
const OPENTYPE_URL = 'https://esm.sh/opentype.js@1.3.4';

let _jscad = null;
async function getJscad() {
  if (!_jscad) _jscad = await import(JSCAD_URL);
  return _jscad;
}

/**
 * Main entry point — called by the core system on every form change.
 *
 * @param {Object} inputs   Key/value map from the form. Keys match config.inputs[].id.
 * @returns {Object}        Keys must match config.colorRegions[].id.
 *                          Values are JSCAD geom3 objects (or null to skip a region).
 */
export async function generate(inputs) {
  const { fieldId = 'DEFAULT', size = 3 } = inputs;

  const jscad = await getJscad();
  const { primitives, extrusions, transforms, booleans } = jscad;

  // --- Build geometry here using JSCAD primitives ---
  // Key JSCAD operations:
  //   primitives.polygon({ points: [[x,y], …] })   → 2D shape
  //   primitives.cuboid({ size: [x, y, z] })        → box
  //   primitives.cylinder({ radius, height })        → cylinder
  //   extrusions.extrudeLinear({ height }, shape2d)  → extrude 2D → 3D
  //   booleans.union(a, b)                           → merge two solids
  //   booleans.subtract(a, b)                        → cut b out of a
  //   transforms.translate([x, y, z], geom)          → move
  //   transforms.rotate([rx, ry, rz], geom)          → rotate (radians)

  const body = extrusions.extrudeLinear(
    { height: size },
    primitives.polygon({ points: [[0,0],[100,0],[100,120],[0,120]] })
  );

  return {
    body,   // matches colorRegion id 'body'
    // text: null,  ← null regions are skipped (no STL exported, no mesh shown)
  };
}
```

**JSCAD coordinate system:** X = right, Y = up (in 2D) / forward (in 3D), Z = up (out of bed).
All units are millimeters.

---

## How to Add a New Design (Step-by-Step)

1. **Create the folder:**
   ```
   js/designs/<your-design-id>/
   ```

2. **Create `config.js`** — fill in the template above.
   - `id` must be lowercase, hyphenated, URL-safe (e.g., `football-helmet`)
   - `colorRegions` max 4 for Snapmaker J1

3. **Create `geometry.js`** — implement `export async function generate(inputs)`.
   - Return an object whose keys match every `id` in `config.colorRegions`
   - Geometry must fit within 160mm × 160mm × 150mm
   - Minimum wall/feature thickness: 1.2mm (2 perimeters at 0.6mm line width)

4. **Register the design in `js/core/design-registry.js`:**
   ```js
   // Add import at the top
   import myNewDesign from '../designs/your-design-id/config.js';

   export const designs = [
     basketballJersey,
     myNewDesign,      // ← add here
   ];
   ```
   This is the **only core file you touch** to add a design.

5. **Add a thumbnail** (optional but recommended):
   - Place a PNG at `assets/thumbnails/<your-design-id>.png`
   - Recommended: 400×300px, showing the printed result
   - Update `thumbnail` in `config.js` once the image exists

6. **Test locally** — serve with any static file server:
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```
   Then open `http://localhost:8080`.

---

## Existing Design: Basketball Jersey

Located at `js/designs/basketball-jersey/`.

**What it produces (4 color regions):**

| Region | STL File | Default Color | Description |
|--------|----------|---------------|-------------|
| `body` | `basketball-jersey__body.stl` | `#C8102E` (red) | Jersey silhouette, base layer |
| `number` | `basketball-jersey__number.stl` | `#FFFFFF` (white) | Jersey number, raised 2mm |
| `name` | `basketball-jersey__name.stl` | `#FFFFFF` (white) | Player name, raised 2mm |
| `trim` | `basketball-jersey__trim.stl` | `#041E42` (navy) | Border ring around jersey edge |

**User inputs:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `playerName` | text | `SMITH` | Max 14 chars; all-caps recommended |
| `number` | text | `23` | 1–2 digits |
| `jerseyStyle` | select | `NBA Modern` | Adjusts shoulder/collar shape |
| `showTrim` | checkbox | `true` | Toggles trim region on/off |
| `baseThickness` | range | `3mm` | 2–6mm in 0.5mm steps |

**Jersey geometry dimensions:** ~100mm wide × 120mm tall × (baseThickness + 2)mm deep.

**Print dimensions fit Snapmaker J1 bed (160mm × 160mm) with room to spare.**

---

## Dependencies (All via CDN — No Install Required)

| Library | Version | URL | Used In |
|---------|---------|-----|---------|
| Three.js | 0.160.0 | `unpkg.com/three@0.160.0` | `viewer.js` |
| JSCAD modeling | 2.12.0 | `esm.sh/@jscad/modeling@2.12.0` | `geometry.js` files |
| JSCAD STL serializer | 2.1.14 | `esm.sh/@jscad/stl-serializer@2.1.14` | `stl-exporter.js` |
| opentype.js | 1.3.4 | `esm.sh/opentype.js@1.3.4` | `geometry.js` (text designs) |
| Bebas Neue font | — | `cdn.jsdelivr.net` (Google Fonts repo) | `basketball-jersey/geometry.js` |

Import maps are declared in `viewer.html` so module specifiers resolve correctly.

---

## Future Design Prompts

When acting as a 3D designer to add new designs, use this prompt template:

```
I want to add a new design to the Custom STL Creator.

**Design name:** [e.g., "Football Helmet Keychain"]
**Description:** [1–2 sentences — what it is, who it's for]

**Inputs the user should customize:**
- [fieldId]: [type: text|number|select|checkbox|range] — [description, valid range/options]
- ...

**Color regions (max 4 for Snapmaker J1):**
- [regionId]: [default hex] — [what this covers]
- ...

**Geometry description:**
[Plain-language 3D shape description. Be specific about:]
- Overall bounding box in mm (must fit 160×160×150mm)
- What is raised vs flat vs engraved
- Where text or logos appear and how large
- Layer stack (Z order: what sits on top of what)
- Any organic/curved features
- Minimum wall thickness: 1.2mm

**Reference images:** [attach if available]

**Special requirements:** [e.g., "no supports", "text must be ≥3mm tall to be readable at 0.2mm layers"]

Please create config.js and geometry.js following ARCHITECTURE.md,
register the design in design-registry.js, add a placeholder thumbnail entry,
and push to the branch.
```

### Design Tips for Printability

- **Minimum feature size:** 1.2mm walls, 0.8mm gaps (at 0.4mm nozzle)
- **Text legibility:** Letters need ≥3mm cap height at 0.2mm layer height
- **Bed limit:** 160mm × 160mm × 150mm (Snapmaker J1)
- **No supports:** Design flat plaques or objects that print upright without overhangs >45°
- **Color registration:** All region STLs share origin (0,0,0) — they stack in-place on the bed
- **STL naming:** Exported as `<designId>__<regionId>.stl` — reference this in `printGuide`
- **Font choice:** Bebas Neue (current) is bold and reads well at small sizes; swap via `FONT_URL` in `geometry.js`

### Recommended Design Categories to Add

These would each validate the architecture and produce useful prints:

- `football-helmet` — Helmet side-profile plaque with team name and number
- `soccer-ball` — Round plaque with hex/penta panel pattern
- `hockey-puck` — Circular plaque with team logo silhouette
- `nameplate` — Simple rectangular desk nameplate with raised letters
- `trophy-base` — Engraved trophy base with event name and date
- `keychain` — Small flat keychain with custom text, with a through-hole

---

## JavaScript Developer Notes

### Core files you may need to update

**`js/core/viewer.js`** — Three.js scene
- `loadGeometries(geometries, colors)` at line ~80: converts JSCAD geom3 → THREE.Mesh
- `setRegionColor(regionId, hex)` at line ~140: live recolor without regeneration
- Camera auto-positions based on model bounding box
- If a new design produces geometry outside the expected size range, camera framing adjusts automatically

**`js/core/ui-builder.js`** — Form generator
- Supports: `text`, `number`, `email`, `textarea`, `select`, `checkbox`, `range`
- To add a new input type, add a case in the `buildField()` switch statement
- All inputs fire the debounced `onChange` callback on the `input` or `change` event

**`js/core/color-manager.js`** — Color state
- `buildColorPanel(colorRegions)`: renders color picker rows
- `getColors()`: returns current `{ regionId: hex }` snapshot
- `setColor(regionId, hex)`: programmatic color update (used for presets)

**`js/core/stl-exporter.js`** — Download handler
- `buildExportButtons(colorRegions, getGeometry)`: renders per-region download buttons
- `exportAllSTL(designId, colorRegions, geometries)`: batch download with 150ms delay between files
- Output filenames: `<designId>__<regionId>.stl`

**`js/core/design-registry.js`** — The only file touched to register a design
- Import the config, add to the `designs` array. Done.

### What the core system guarantees (you don't need to handle these)

- Debounced geometry regeneration on input change (400ms)
- Loading spinner during async `generate()` calls
- Error display if `generate()` throws
- JSCAD geom3 → THREE.BufferGeometry conversion (fan triangulation)
- Per-region mesh isolation so color changes don't trigger regeneration
- Blob URL cleanup after STL download (5s timeout)

### What you must handle in `geometry.js`

- All JSCAD operations are synchronous except CDN imports (handle with `async/await`)
- Cache imported modules in module-level variables (avoid re-importing on every call)
- Return `null` for a region if it shouldn't appear (e.g., `trim: null` when `showTrim` is false)
- Keep geometry within the bed size specified in `config.printer.bedSize`
- All geometry should sit at Z ≥ 0 (bottom of print bed)
