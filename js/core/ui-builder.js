/**
 * ui-builder.js
 *
 * Reads a design's `inputs` config array and renders a form into a container.
 * Supported input types: text, number, select, checkbox, range, textarea.
 *
 * @param {Object}      design      — design config object
 * @param {HTMLElement} container   — DOM element to render into
 * @param {Function}    onChange    — called whenever any value changes
 */
export function buildForm(design, container, onChange) {
  container.innerHTML = '';

  if (!design.inputs || design.inputs.length === 0) {
    container.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted)">No customization options.</p>';
    return;
  }

  design.inputs.forEach(inp => {
    const group = document.createElement('div');
    group.className = 'form-group';

    const label = document.createElement('label');
    label.className = 'form-label';
    label.htmlFor = `input-${inp.id}`;
    label.textContent = inp.label;
    if (inp.type !== 'checkbox') group.appendChild(label);

    let el;

    switch (inp.type) {
      case 'select': {
        el = document.createElement('select');
        el.className = 'form-select';
        inp.options.forEach(opt => {
          const o = document.createElement('option');
          const val = typeof opt === 'object' ? opt.value : opt;
          const text = typeof opt === 'object' ? opt.label : opt;
          o.value = val;
          o.textContent = text;
          if (val === inp.default || text === inp.default) o.selected = true;
          el.appendChild(o);
        });
        break;
      }

      case 'checkbox': {
        const wrap = document.createElement('div');
        wrap.className = 'form-check';
        el = document.createElement('input');
        el.type = 'checkbox';
        el.checked = !!inp.default;
        const cbLabel = document.createElement('label');
        cbLabel.className = 'form-label';
        cbLabel.htmlFor = `input-${inp.id}`;
        cbLabel.textContent = inp.label;
        cbLabel.style.marginBottom = '0';
        wrap.appendChild(el);
        wrap.appendChild(cbLabel);
        group.appendChild(wrap);
        break;
      }

      case 'range': {
        el = document.createElement('input');
        el.type = 'range';
        if (inp.min !== undefined) el.min = inp.min;
        if (inp.max !== undefined) el.max = inp.max;
        if (inp.step !== undefined) el.step = inp.step;
        el.value = inp.default ?? '';
        el.className = 'form-input';

        // Show live value
        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'form-hint';
        valueDisplay.textContent = el.value + (inp.unit || '');
        el.addEventListener('input', () => {
          valueDisplay.textContent = el.value + (inp.unit || '');
        });
        group.appendChild(label);
        group.appendChild(el);
        group.appendChild(valueDisplay);
        break;
      }

      case 'textarea': {
        el = document.createElement('textarea');
        el.className = 'form-input';
        el.rows = inp.rows || 3;
        el.value = inp.default ?? '';
        if (inp.maxLength) el.maxLength = inp.maxLength;
        break;
      }

      default: { // text, number, email, …
        el = document.createElement('input');
        el.type = inp.type || 'text';
        el.value = inp.default ?? '';
        el.className = 'form-input';
        if (inp.min !== undefined)       el.min = inp.min;
        if (inp.max !== undefined)       el.max = inp.max;
        if (inp.step !== undefined)      el.step = inp.step;
        if (inp.maxLength !== undefined) el.maxLength = inp.maxLength;
        if (inp.placeholder)             el.placeholder = inp.placeholder;
        break;
      }
    }

    el.id = `input-${inp.id}`;
    el.name = inp.id;
    el.addEventListener('change', onChange);
    el.addEventListener('input',  onChange);

    // For range, elements already added above
    if (inp.type !== 'range' && inp.type !== 'checkbox') {
      group.appendChild(el);
    } else if (inp.type === 'checkbox') {
      // already added inside wrap
    }

    if (inp.hint) {
      const hint = document.createElement('span');
      hint.className = 'form-hint';
      hint.textContent = inp.hint;
      group.appendChild(hint);
    }

    container.appendChild(group);
  });
}
