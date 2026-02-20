/**
 * basketball-jersey/geometry.js
 *
 * Generates parametric JSCAD geometry for the basketball jersey plaque.
 *
 * Returns: { body, number, name, trim }
 * Each value is a JSCAD geom3 object (or null if not applicable).
 *
 * Layout (top-down, Z is up):
 *   Z 0            → bottom of print
 *   Z baseThickness → top of jersey body
 *   Z +2mm         → top of raised text / trim
 */

const JSCAD_MODELING = 'https://esm.sh/@jscad/modeling@2.12.0';
const OPENTYPE_URL   = 'https://esm.sh/opentype.js@1.3.4';
// Bebas Neue — free sports-style font, hosted on jsDelivr from Google Fonts repo
const FONT_URL       = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/bebasnеue/BebasNeue-Regular.ttf';

let _jscad    = null;
let _opentype = null;
let _font     = null;

async function getJscad() {
  if (!_jscad) _jscad = await import(JSCAD_MODELING);
  return _jscad;
}

async function getFont() {
  if (_font) return _font;
  if (!_opentype) _opentype = (await import(OPENTYPE_URL)).default;
  _font = await _opentype.load(FONT_URL);
  return _font;
}

// ── Public entry point ────────────────────────────────────────────────────

/**
 * @param {Object} inputs  — matches basketball-jersey/config.js inputs ids
 * @returns {Object}       — { body, number, name, trim }
 */
export async function generate(inputs) {
  const {
    playerName    = 'SMITH',
    number        = '23',
    jerseyStyle   = 'NBA Modern',
    showTrim      = true,
    baseThickness = 3,
  } = inputs;

  const jscad   = await getJscad();
  const font    = await getFont();
  const textH   = 2.0;   // mm — how much text raises above body
  const trimW   = 1.5;   // mm — trim border width

  // Jersey silhouette points (in mm, 0,0 = bottom-left of bounding box)
  const silhouette = jerseyPoints(jerseyStyle);

  // ── Body (jersey silhouette extruded) ─────────────────────────────────
  const bodyGeom = buildBody(jscad, silhouette, baseThickness);

  // ── Number (large, centered upper half) ──────────────────────────────
  const numStr      = String(number).substring(0, 2);
  const numberGeom  = await buildText(jscad, font, numStr, {
    size:       28,
    z:          baseThickness,
    height:     textH,
    centerX:    50,          // jersey is ~100mm wide
    centerY:    68,          // place in upper half
    silhouette,
  });

  // ── Name (smaller, lower strip) ──────────────────────────────────────
  const nameStr  = String(playerName).toUpperCase().substring(0, 14);
  const nameGeom = await buildText(jscad, font, nameStr, {
    size:       10,
    z:          baseThickness,
    height:     textH,
    centerX:    50,
    centerY:    26,
    silhouette,
  });

  // ── Trim (thin border around silhouette) ──────────────────────────────
  let trimGeom = null;
  if (showTrim) {
    trimGeom = buildTrim(jscad, silhouette, baseThickness, trimW, textH);
  }

  return {
    body:   bodyGeom,
    number: numberGeom,
    name:   nameGeom,
    trim:   trimGeom,
  };
}

// ── Jersey silhouette ─────────────────────────────────────────────────────

/**
 * Returns an array of [x, y] 2D points (mm) for the jersey outline.
 * Origin is bottom-left. Overall ~100mm × 120mm.
 *
 * The style tweaks shoulder width and collar shape.
 */
function jerseyPoints(style) {
  // Base shape — common to all styles
  //
  //        [collar area — carved out at top center]
  //  ┌─────────────────────────────────────────────┐  y=120
  //  │  left      shoulder                 right   │
  //  │  \_______/                   \_______/      │  y=95
  //  │                                             │
  //  │                                             │
  //  └─────────────────────────────────────────────┘  y=0
  //  x=0                                        x=100

  const W  = 100;
  const H  = 120;
  const shoulderDrop  = style === 'Retro' ? 18 : 14;
  const armholeWidth  = style === 'College' ? 22 : 18;
  const armholeDepth  = style === 'Retro' ? 30 : 24;
  const collarW       = style === 'NBA Modern' ? 20 : 16;
  const collarDepth   = style === 'NBA Modern' ? 12 : 10;

  // Clockwise from bottom-left
  return [
    // Bottom edge
    [0,       0],
    [W,       0],
    // Right side up
    [W,       H - shoulderDrop],
    // Right armhole (step in)
    [W - armholeWidth,  H - shoulderDrop],
    [W - armholeWidth,  H - armholeDepth],
    // Right shoulder (up to top)
    [W - armholeWidth,  H],
    // Top-right toward collar
    [W / 2 + collarW,   H],
    // Collar dip (V-shape approximated with 3 points)
    [W / 2,             H - collarDepth],
    [W / 2 - collarW,   H],
    // Top-left shoulder
    [armholeWidth,      H],
    // Left armhole
    [armholeWidth,      H - armholeDepth],
    [armholeWidth,      H - shoulderDrop],
    // Left side down
    [0,                 H - shoulderDrop],
  ];
}

// ── Body geometry ─────────────────────────────────────────────────────────

function buildBody(jscad, points, thickness) {
  const { primitives, extrusions } = jscad;

  const poly = primitives.polygon({ points });
  return extrusions.extrudeLinear({ height: thickness }, poly);
}

// ── Text geometry ─────────────────────────────────────────────────────────

/**
 * Converts an opentype.js path into an array of JSCAD polygon geometries,
 * one per glyph contour, then unions them and extrudes.
 */
async function buildText(jscad, font, text, opts) {
  const {
    size     = 20,
    z        = 3,
    height   = 2,
    centerX  = 50,
    centerY  = 50,
  } = opts;

  const { primitives, extrusions, transforms, booleans } = jscad;

  if (!text || text.trim() === '') return null;

  // Get glyph outlines
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);

  let cursorX = 0;
  const allPolygons = [];

  for (let gi = 0; gi < glyphs.length; gi++) {
    const glyph = glyphs[gi];
    const path  = glyph.getPath(0, 0, size);

    const contours = pathToContours(path, scale);
    contours.forEach(pts => {
      if (pts.length >= 3) {
        try {
          const poly = primitives.polygon({ points: pts });
          allPolygons.push({ poly, offsetX: cursorX });
        } catch (e) {
          // Skip degenerate contours
        }
      }
    });

    // Advance cursor
    const adv = glyph.advanceWidth || size * 0.6;
    cursorX += adv * scale;

    // Kerning
    if (gi < glyphs.length - 1) {
      const kern = font.getKerningValue(glyph, glyphs[gi + 1]);
      cursorX += kern * scale;
    }
  }

  if (allPolygons.length === 0) return null;

  // Measure total text width for centering
  const textWidth = cursorX;
  const startX    = centerX - textWidth / 2;

  // Extrude and position each contour
  const extruded = allPolygons.map(({ poly, offsetX }) => {
    const solid = extrusions.extrudeLinear({ height }, poly);
    return transforms.translate([startX + offsetX, centerY, z], solid);
  });

  // Union all character solids into one geometry
  if (extruded.length === 1) return extruded[0];
  return booleans.union(...extruded);
}

// ── Trim geometry ─────────────────────────────────────────────────────────

function buildTrim(jscad, points, baseThickness, trimWidth, textHeight) {
  const { primitives, extrusions, booleans } = jscad;

  // Outer: the jersey silhouette
  const outer = primitives.polygon({ points });
  // Inner: silhouette shrunk by trimWidth
  const innerPts = shrinkPolygon(points, trimWidth);
  const inner = primitives.polygon({ points: innerPts });

  // Subtract inner from outer to get a border ring
  const ring   = booleans.subtract(outer, inner);
  const height = baseThickness + textHeight;
  return extrusions.extrudeLinear({ height }, ring);
}

// ── Path utilities ────────────────────────────────────────────────────────

/**
 * Convert an opentype Path object into an array of contour point arrays.
 * Each contour is [ [x,y], [x,y], … ] — JSCAD polygon input.
 */
function pathToContours(path, scale) {
  const BEZIER_STEPS = 8; // segments per curve (higher = smoother)
  const contours = [];
  let current    = [];
  let cx = 0, cy = 0;

  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M': {
        if (current.length > 2) contours.push(current);
        current = [];
        cx = cmd.x; cy = cmd.y;
        current.push([cx, cy]);
        break;
      }
      case 'L': {
        cx = cmd.x; cy = cmd.y;
        current.push([cx, cy]);
        break;
      }
      case 'C': {
        // Cubic Bezier: from (cx,cy) through (x1,y1),(x2,y2) to (x,y)
        const pts = sampleCubic(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, BEZIER_STEPS);
        pts.forEach(p => current.push(p));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case 'Q': {
        // Quadratic Bezier
        const pts = sampleQuadratic(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y, BEZIER_STEPS);
        pts.forEach(p => current.push(p));
        cx = cmd.x; cy = cmd.y;
        break;
      }
      case 'Z': {
        if (current.length > 2) contours.push(current);
        current = [];
        break;
      }
    }
  }
  if (current.length > 2) contours.push(current);
  return contours;
}

function sampleCubic(x0, y0, x1, y1, x2, y2, x3, y3, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t  = i / steps;
    const mt = 1 - t;
    const x  = mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3;
    const y  = mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3;
    pts.push([x, y]);
  }
  return pts;
}

function sampleQuadratic(x0, y0, x1, y1, x2, y2, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const t  = i / steps;
    const mt = 1 - t;
    const x  = mt*mt*x0 + 2*mt*t*x1 + t*t*x2;
    const y  = mt*mt*y0 + 2*mt*t*y1 + t*t*y2;
    pts.push([x, y]);
  }
  return pts;
}

/**
 * Shrink a polygon inward by `amount` mm using a simple vertex-normal approach.
 */
function shrinkPolygon(points, amount) {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    // Edge vectors
    const e1x = p[0] - prev[0], e1y = p[1] - prev[1];
    const e2x = next[0] - p[0], e2y = next[1] - p[1];
    // Inward normals (for a CCW polygon, inward is to the right)
    const n1x = e1y, n1y = -e1x;
    const n2x = e2y, n2y = -e2x;
    // Normalize
    const l1 = Math.sqrt(n1x*n1x + n1y*n1y) || 1;
    const l2 = Math.sqrt(n2x*n2x + n2y*n2y) || 1;
    const bx = n1x/l1 + n2x/l2;
    const by = n1y/l1 + n2y/l2;
    const lb = Math.sqrt(bx*bx + by*by) || 1;
    return [p[0] + (bx/lb)*amount, p[1] + (by/lb)*amount];
  });
}
