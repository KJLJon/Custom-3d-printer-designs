/**
 * Basketball Jersey Plaque — Design Config
 *
 * A flat, wall-mountable jersey plaque with customizable player name
 * and number. Designed for multi-color FDM printing on the Snapmaker J1/J1s.
 *
 * Print dimensions: ~100mm wide × 120mm tall × 5mm deep
 * Colors: 3 (body, text/number, trim)
 */

export default {
  id: 'basketball-jersey',
  name: 'Basketball Jersey',
  description: 'Customizable jersey plaque with player name and number. Great for locker tags, trophies, or wall art.',
  thumbnail: null, // set to 'assets/thumbnails/basketball-jersey.png' once image exists

  inputs: [
    {
      id: 'playerName',
      type: 'text',
      label: 'Player Name',
      default: 'SMITH',
      maxLength: 14,
      placeholder: 'e.g. JORDAN',
      hint: 'Up to 14 characters. Use ALL CAPS for best results.',
    },
    {
      id: 'number',
      type: 'text',
      label: 'Jersey Number',
      default: '23',
      maxLength: 2,
      placeholder: '0–99',
      hint: '1 or 2 digits.',
    },
    {
      id: 'jerseyStyle',
      type: 'select',
      label: 'Jersey Style',
      options: ['NBA Modern', 'College', 'Retro'],
      default: 'NBA Modern',
    },
    {
      id: 'showTrim',
      type: 'checkbox',
      label: 'Include trim border',
      default: true,
    },
    {
      id: 'baseThickness',
      type: 'range',
      label: 'Base Thickness',
      default: 3,
      min: 2,
      max: 6,
      step: 0.5,
      unit: ' mm',
      hint: 'Thickness of the jersey background plate.',
    },
  ],

  colorRegions: [
    { id: 'body',   label: 'Jersey Body',   default: '#C8102E' }, // Cavaliers red
    { id: 'number', label: 'Number',        default: '#FFFFFF' },
    { id: 'name',   label: 'Player Name',   default: '#FFFFFF' },
    { id: 'trim',   label: 'Trim / Border', default: '#041E42' }, // Navy
  ],

  printer: {
    maxColors: 4,
    bedSize: { x: 160, y: 160 },
    defaultLayerHeight: 0.2,
    minWallThickness: 1.2,
  },

  printGuide: `
    <ol>
      <li>Download all 4 STL files.</li>
      <li>Open <strong>Snapmaker Luban</strong> and start a new multi-color project.</li>
      <li>Import <code>basketball-jersey__body.stl</code> → assign to Extruder 1 (jersey color).</li>
      <li>Import <code>basketball-jersey__number.stl</code> → assign to Extruder 2 (number color).</li>
      <li>Import <code>basketball-jersey__name.stl</code> → assign to Extruder 3 (name color).</li>
      <li>Import <code>basketball-jersey__trim.stl</code> → assign to Extruder 4 (trim color).</li>
      <li>All files share the same origin — they will align automatically.</li>
      <li>Slice at 0.2mm layer height. No supports needed.</li>
    </ol>
  `,
};
