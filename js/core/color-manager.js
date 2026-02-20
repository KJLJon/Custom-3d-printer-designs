/**
 * color-manager.js
 *
 * Renders color pickers for each colorRegion defined in a design's config.
 * Keeps a live map of { regionId → hex } used by the viewer and exporter.
 *
 * @param {Object}      design      — design config
 * @param {HTMLElement} container   — where to render swatches
 * @param {Function}    onChange    — called with (regionId, hex) on color change
 */

// Internal state: regionId → current hex color
const _colors = {};

export function buildColorPanel(design, container, onChange) {
  container.innerHTML = '';
  Object.keys(_colors).forEach(k => delete _colors[k]);

  if (!design.colorRegions || design.colorRegions.length === 0) {
    container.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted)">No color regions defined.</p>';
    return;
  }

  design.colorRegions.forEach(region => {
    _colors[region.id] = region.default || '#888888';

    const row = document.createElement('div');
    row.className = 'color-region-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'color-region-label';
    labelEl.textContent = region.label;

    const pickerWrap = document.createElement('div');
    pickerWrap.className = 'color-picker-wrap';

    const preview = document.createElement('div');
    preview.className = 'color-swatch-preview';
    preview.style.background = region.default || '#888888';
    preview.id = `swatch-preview-${region.id}`;

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = region.default || '#888888';
    picker.id = `color-${region.id}`;
    picker.setAttribute('aria-label', `Color for ${region.label}`);

    picker.addEventListener('input', () => {
      const hex = picker.value;
      _colors[region.id] = hex;
      preview.style.background = hex;
      onChange(region.id, hex);
    });

    pickerWrap.appendChild(preview);
    pickerWrap.appendChild(picker);
    row.appendChild(labelEl);
    row.appendChild(pickerWrap);
    container.appendChild(row);
  });
}

/**
 * Returns a snapshot of current colors { regionId: hex }.
 * Safe to call at any time (even before buildColorPanel).
 */
export function getColors() {
  return { ..._colors };
}

/**
 * Programmatically set a color (e.g. from a preset palette).
 */
export function setColor(regionId, hex) {
  _colors[regionId] = hex;
  const picker  = document.getElementById(`color-${regionId}`);
  const preview = document.getElementById(`swatch-preview-${regionId}`);
  if (picker)  picker.value = hex;
  if (preview) preview.style.background = hex;
}
