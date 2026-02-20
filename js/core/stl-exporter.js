/**
 * stl-exporter.js
 *
 * Handles STL file export.
 * - One STL per color region (for multi-color Snapmaker J1/J1s workflow)
 * - Uses @jscad/stl-serializer via esm.sh CDN
 * - Downloads files to the user's browser
 */

const JSCAD_STL_SERIALIZER = 'https://esm.sh/@jscad/stl-serializer@2.1.14';

/**
 * Build per-region export buttons in the sidebar.
 * @param {Object}      design    — design config
 * @param {HTMLElement} container — where to render buttons
 */
export function buildExportButtons(design, container) {
  container.innerHTML = '';
  if (!design.colorRegions) return;

  design.colorRegions.forEach(region => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.id = `export-btn-${region.id}`;
    btn.disabled = true;
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 13h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
      ${region.label}
    `;
    btn.dataset.regionId = region.id;
    container.appendChild(btn);
  });
}

/**
 * Enable export buttons once geometry is ready.
 * Called by viewer.html after a successful generate().
 */
export function enableExportButtons(design, geometries, inputs) {
  if (!design.colorRegions) return;
  design.colorRegions.forEach(region => {
    const btn = document.getElementById(`export-btn-${region.id}`);
    if (!btn) return;
    btn.disabled = false;
    // Remove old listeners cleanly
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => exportRegionSTL(region, geometries[region.id], inputs, design));
  });
}

/**
 * Download STL files for all regions at once.
 * @param {Object} design  — design config
 * @param {Object} inputs  — current form values
 */
export async function exportAllSTL(design, inputs) {
  const { generate } = await import(`../designs/${design.id}/geometry.js`);
  const geometries   = await generate(inputs);

  for (const region of design.colorRegions) {
    if (!geometries[region.id]) continue;
    await exportRegionSTL(region, geometries[region.id], inputs, design);
    // Small delay between downloads so the browser doesn't block them
    await new Promise(r => setTimeout(r, 150));
  }
}

/**
 * Download a single region's geometry as a binary STL.
 */
async function exportRegionSTL(region, geometry, inputs, design) {
  if (!geometry) {
    console.warn(`No geometry for region "${region.id}"`);
    return;
  }

  const { serialize } = await import(JSCAD_STL_SERIALIZER);

  // JSCAD geometries can be an array or a single solid
  const solids = Array.isArray(geometry) ? geometry : [geometry];
  const rawData = serialize({ binary: true }, ...solids);

  // rawData is an array of ArrayBuffers
  const buffer = rawData instanceof ArrayBuffer ? rawData : rawData[0];
  const blob   = new Blob([buffer], { type: 'application/octet-stream' });
  const url    = URL.createObjectURL(blob);

  const filename = `${design.id}__${region.id}.stl`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
