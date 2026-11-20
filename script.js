/* ==========================================================================
   Irregular Room Paint Calculator — script.js
   Vanilla JS, no dependencies. All maths runs locally in the browser.
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     1. Constants & unit conversion
     ------------------------------------------------------------------ */
  var FT_TO_M    = 0.3048;          // 1 ft  = 0.3048 m
  var SQFT_TO_SQM = 0.09290304;      // 1 ft² = 0.09290304 m²
  var GAL_TO_L   = 3.785411784;      // 1 gal = 3.785411784 L

  var SYSTEMS = {
    imperial: {
      len: 'ft',
      area: 'sq ft',
      areaShort: 'sq ft',
      vol: 'gal',
      volPlural: 'gallons',
      coverage: 350,
      coverageLabel: 'sq ft / gal',
      coverageHint: 'Check your paint can — typical range is 300–400 sq ft per gallon.',
      coveragePresets: [300, 350, 400],
      cans: [
        { size: 5,    label: '5-gal',  unit: 'gal' },
        { size: 1,    label: '1-gal',  unit: 'gal' },
        { size: 0.25, label: '1-quart', unit: 'gal' }
      ]
    },
    metric: {
      len: 'm',
      area: 'm²',
      areaShort: 'm²',
      vol: 'L',
      volPlural: 'litres',
      coverage: 10,
      coverageLabel: 'm² / L',
      coverageHint: 'Check your paint can — typical range is 8–12 m² per litre.',
      coveragePresets: [8, 10, 12],
      cans: [
        { size: 5, label: '5 L', unit: 'L' },
        { size: 1, label: '1 L', unit: 'L' }
      ]
    }
  };

  // Coverage stored physically as sq ft per gallon; metric view derives m²/L.
  var COVERAGE_SQFT_PER_GAL = 350;
  var COVERAGE_M2_PER_L    = 10;

  var PRESETS = {
    door:   { imperial: { w: 3,   h: 7 }, metric: { w: 0.9, h: 2.1 } },
    window: { imperial: { w: 3,   h: 4 }, metric: { w: 0.9, h: 1.2 } }
  };

  var SHAPES = {
    rect: {
      name: 'Rectangle',
      hint: 'flat wall',
      sub: 'Flat wall — also how you split an L-shaped room',
      icon: '<rect x="3.5" y="6.5" width="17" height="11" rx="1.2" stroke="currentColor" stroke-width="1.8" fill="none"/>',
      fields: [
        { key: 'width',  label: 'Width' },
        { key: 'height', label: 'Height' }
      ],
      cols: 2
    },
    triangle: {
      name: 'Triangle',
      hint: 'gable end',
      sub: 'Gable end or peaked wall',
      icon: '<path d="M12 4.5 21 18.5H3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>',
      fields: [
        { key: 'base',   label: 'Base width' },
        { key: 'height', label: 'Peak height' }
      ],
      cols: 2
    },
    trapezoid: {
      name: 'Trapezoid',
      hint: 'slanted wall',
      sub: 'Slanted wall, knee wall or vaulted edge',
      icon: '<path d="M6.5 18.5h11l-2.4-11H8.9Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>',
      fields: [
        { key: 'bottom', label: 'Bottom width' },
        { key: 'top',    label: 'Top width' },
        { key: 'height', label: 'Vertical height' }
      ],
      cols: 3
    },
    sloped: {
      name: 'Sloped rectangle',
      hint: 'sloped plane',
      sub: 'Wall or ceiling meeting a slope',
      icon: '<path d="M4 18.5h16V8H10.2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" fill="none"/>',
      cols: 3
    }
  };

  /* ------------------------------------------------------------------
     2. State
     ------------------------------------------------------------------ */
  var state = {
    unit: 'imperial',
    coats: 2,
    coverage: COVERAGE_SQFT_PER_GAL,  // always held in sq ft / gallon
    coverageTouched: false,
    waste: 10,
    sections: [],
    deductions: [],
    nextId: 1
  };

  function sys() { return SYSTEMS[state.unit]; }

  function makeSection(type) {
    var values = {};
    if (type === 'rect')       { values = { width: 12, height: 8 }; }
    else if (type === 'triangle'){ values = { base: 12, height: 4 }; }
    else if (type === 'trapezoid'){ values = { bottom: 10, top: 6, height: 8 }; }
    else if (type === 'sloped') { values = { width: 12, run: 8, rise: 3 }; }
    return { id: state.nextId++, type: type, mode: 'rise', values: values };
  }

  function makeDeduction(label, w, hgt) {
    return { id: state.nextId++, label: label, w: w, h: hgt };
  }

  /* ------------------------------------------------------------------
     3. Small helpers
     ------------------------------------------------------------------ */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else node.setAttribute(k, v);
      });
    }
    if (children !== undefined && children !== null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function num(value) {
    var n = parseFloat(value);
    if (!isFinite(n) || isNaN(n)) return 0;
    return n < 0 ? 0 : n;
  }

  // Plain number string, trimmed — used inside formulas.
  function plain(n, dec) {
    if (!isFinite(n)) return '0';
    var d = dec === undefined ? 2 : dec;
    var s = n.toFixed(d);
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  // Grouped number string — used in results.
  function grouped(n, dec) {
    if (typeof n !== 'number' || !isFinite(n)) n = 0;
    var d = dec === undefined ? 1 : dec;
    var s = n.toFixed(d);
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  // Volume — always two decimals, e.g. 1.20 gal
  function vol(n) {
    if (typeof n !== 'number' || !isFinite(n)) n = 0;
    var parts = n.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function plural(n, one, many) { return n === 1 ? one : many; }

  function lenToM(v)  { return v * FT_TO_M; }
  function lenFromM(v){ return v / FT_TO_M; }
  function areaToM2(v) { return v * SQFT_TO_SQM; }
  function areaFromM2(v){ return v / SQFT_TO_SQM; }
  function galToL(v)   { return v * GAL_TO_L; }
  function lToGal(v)   { return v / GAL_TO_L; }

  function convertLength(v, from, to) {
    if (from === to) return v;
    return from === 'imperial' ? lenToM(v) : lenFromM(v);
  }

  // Coverage is physically "sq ft per gallon"; metric divides by litres.
  function coverageDisplay() {
    return state.unit === 'imperial'
      ? state.coverage
      : (state.coverage * SQFT_TO_SQM) / GAL_TO_L;   // m² per litre
  }

  function setCoverageDisplay(value) {
    state.coverage = state.unit === 'imperial'
      ? value
      : (value * GAL_TO_L) / SQFT_TO_SQM;              // back to sq ft per gallon
  }

  function svgIcon(path, size) {
    return h('span', { class: 'sec__icon', html:
      '<svg viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) +
      '" aria-hidden="true" focusable="false">' + path + '</svg>' });
  }

  /* ------------------------------------------------------------------
     4. Shape maths
     ------------------------------------------------------------------ */
  function shapeArea(section) {
    var v = section.values;
    var a = 0, slant = 0;
    switch (section.type) {
      case 'rect':
        a = v.width * v.height;
        break;
      case 'triangle':
        a = 0.5 * v.base * v.height;
        break;
      case 'trapezoid':
        a = 0.5 * (v.bottom + v.top) * v.height;
        break;
      case 'sloped':
        if (section.mode === 'angle') {
          var ang = Math.min(89, Math.max(0, v.angle || 0));
          var c = Math.cos(ang * Math.PI / 180);
          slant = c > 0.01 ? v.run / c : 0;
        } else {
          slant = Math.sqrt(v.run * v.run + v.rise * v.rise);
        }
        a = v.width * slant;
        break;
    }
    return { area: isFinite(a) && a > 0 ? a : 0, slant: slant };
  }

  function shapeFormula(section, area, slant) {
    var v = section.values, U = sys().len, A = sys().area;
    switch (section.type) {
      case 'rect':
        return plain(v.width) + ' ' + U + ' × ' + plain(v.height) + ' ' + U +
               ' = <b>' + plain(area, 1) + ' ' + A + '</b>';
      case 'triangle':
        return '0.5 × ' + plain(v.base) + ' ' + U + ' × ' + plain(v.height) + ' ' + U +
               ' = <b>' + plain(area, 1) + ' ' + A + '</b>';
      case 'trapezoid':
        return '0.5 × (' + plain(v.bottom) + ' ' + U + ' + ' + plain(v.top) + ' ' + U + ') × ' +
               plain(v.height) + ' ' + U + ' = <b>' + plain(area, 1) + ' ' + A + '</b>';
      case 'sloped':
        if (section.mode === 'angle') {
          return plain(v.width) + ' ' + U + ' × ' + plain(v.run) + ' ' + U + ' ÷ cos(' +
                 plain(v.angle, 1) + '°) = ' + plain(v.width) + ' ' + U + ' × ' + plain(slant) + ' ' + U +
                 ' = <b>' + plain(area, 1) + ' ' + A + '</b>';
        }
        return plain(v.width) + ' ' + U + ' × √(' + plain(v.run) + '² + ' + plain(v.rise) + '²) = ' +
               plain(v.width) + ' ' + U + ' × ' + plain(slant) + ' ' + U +
               ' = <b>' + plain(area, 1) + ' ' + A + '</b>';
    }
    return '';
  }

  function shapeLabel(section, index) {
    var n = 1;
    for (var i = 0; i < index; i++) if (state.sections[i].type === section.type) n++;
    return SHAPES[section.type].name + ' ' + n;
  }

  /* ------------------------------------------------------------------
     5. Can planning — round the requirement up to real can sizes
     ------------------------------------------------------------------ */
  function planCans(amount, cans) {
    // amount and can sizes share one unit (gallons, or litres).
    var big = cans[0], mid = cans[1], small = cans[2];
    var EPS = 1e-9;

    if (small && amount <= small.size + EPS) {
      return [{ size: small.size, label: small.label, count: 1, unit: small.unit }];
    }

    var out = [];
    var nBig = Math.floor((amount - EPS) / big.size);
    if (nBig < 0) nBig = 0;
    var rem = amount - nBig * big.size;

    if (small && rem <= small.size + EPS && nBig >= 1) {
      out.push({ size: big.size, label: big.label, count: nBig, unit: big.unit });
      out.push({ size: small.size, label: small.label, count: 1, unit: small.unit });
      return out;
    }

    var nMid = Math.ceil(rem - EPS);
    if (nMid < 0) nMid = 0;
    // Five one-gallon cans are one five-gallon can — fewer trips, same volume.
    if (nMid >= big.size) { nBig += 1; nMid = 0; }

    if (nBig > 0) out.push({ size: big.size, label: big.label, count: nBig, unit: big.unit });
    if (nMid > 0) out.push({ size: mid.size, label: mid.label, count: nMid, unit: mid.unit });
    if (!out.length) out.push({ size: mid.size, label: mid.label, count: 1, unit: mid.unit });
    return out;
  }

  function describePlan(plan) {
    var total = 0, parts = [];
    plan.forEach(function (p) {
      total += p.size * p.count;
      parts.push(p.count + ' × ' + p.label + (p.count > 1 ? ' cans' : ' can'));
    });
    return { total: total, parts: parts.join(' + ') };
  }

  /* ------------------------------------------------------------------
     6. Rendering — sections
     ------------------------------------------------------------------ */
  function numberInput(id, value, opts) {
    opts = opts || {};
    var input = h('input', {
      class: 'input' + (opts.center ? ' input--num' : ''),
      type: 'number',
      id: id,
      inputmode: opts.stepper ? 'numeric' : 'decimal',
      min: opts.min !== undefined ? opts.min : '0',
      max: opts.max,
      step: opts.step || 'any',
      value: String(value)
    });
    return input;
  }

  function field(id, labelText, unitText, input) {
    var lab = h('label', { class: 'sec__label', for: id }, [
      labelText,
      unitText ? h('span', { text: ' (' + unitText + ')' }) : null
    ]);
    return h('div', { class: 'field' }, [lab, input]);
  }

  function renderSections() {
    var list = $('#sections-list');
    list.innerHTML = '';

    state.sections.forEach(function (section, index) {
      var shape = SHAPES[section.type];
      var U = sys().len;
      var area = shapeArea(section).area;

      var head = h('div', { class: 'sec__head' }, [
        svgIcon(shape.icon),
        h('div', {}, [
          h('div', { class: 'sec__name', text: shapeLabel(section, index) }),
          h('div', { class: 'sec__sub', text: shape.sub })
        ]),
        h('div', { class: 'sec__area' }, [
          'Area',
          h('b', { text: grouped(area, 1) + ' ' + sys().area })
        ]),
        h('button', {
          type: 'button',
          class: 'icon-btn',
          'aria-label': 'Remove ' + shapeLabel(section, index),
          html: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        })
      ]);

      head.querySelector('.icon-btn').addEventListener('click', function () {
        state.sections.splice(index, 1);
        renderSections();
        renderResults();
      });

      var grid = h('div', { class: 'grid-' + shape.cols });

      if (section.type === 'sloped') {
        var switcher = h('div', { class: 'mode-switch', role: 'group', 'aria-label': 'Sloped measurement mode' });
        var btnRise = h('button', { type: 'button', text: 'Rise + run', 'aria-pressed': String(section.mode === 'rise') });
        var btnAngle = h('button', { type: 'button', text: 'Angle', 'aria-pressed': String(section.mode === 'angle') });
        btnRise.addEventListener('click', function () {
          section.mode = 'rise';
          if (section.values.angle === undefined) section.values.angle = 25;
          renderSections(); renderResults();
        });
        btnAngle.addEventListener('click', function () {
          section.mode = 'angle';
          if (section.values.angle === undefined) {
            var r = num(section.values.run), ri = num(section.values.rise);
            section.values.angle = (r > 0 && ri > 0) ? Math.atan(ri / r) * 180 / Math.PI : 25;
          }
          renderSections(); renderResults();
        });
        switcher.appendChild(btnRise);
        switcher.appendChild(btnAngle);

        var wrap = h('div', {}, [switcher]);

        if (section.mode === 'angle') {
          var g2 = h('div', { class: 'grid-3' });
          var idW = 'sec' + section.id + '-width', idR = 'sec' + section.id + '-run', idA = 'sec' + section.id + '-angle';
          var iW = numberInput(idW, section.values.width);
          var iR = numberInput(idR, section.values.run);
          var iA = numberInput(idA, Math.round(section.values.angle * 10) / 10, { min: '0', max: '89', step: '0.5' });
          bindField(iW, section, 'width');
          bindField(iR, section, 'run');
          bindField(iA, section, 'angle');
          g2.appendChild(field(idW, 'Width', U, iW));
          g2.appendChild(field(idR, 'Run', U, iR));
          g2.appendChild(field(idA, 'Angle', '°', iA));
          wrap.appendChild(g2);
        } else {
          var g3 = h('div', { class: 'grid-3' });
          var idW2 = 'sec' + section.id + '-width', idR2 = 'sec' + section.id + '-run', idRi = 'sec' + section.id + '-rise';
          var iW2 = numberInput(idW2, section.values.width);
          var iR2 = numberInput(idR2, section.values.run);
          var iRi = numberInput(idRi, section.values.rise);
          bindField(iW2, section, 'width');
          bindField(iR2, section, 'run');
          bindField(iRi, section, 'rise');
          g3.appendChild(field(idW2, 'Width', U, iW2));
          g3.appendChild(field(idR2, 'Horizontal run', U, iR2));
          g3.appendChild(field(idRi, 'Rise', U, iRi));
          wrap.appendChild(g3);
        }

        var card = h('div', { class: 'sec' }, [head, wrap]);
        list.appendChild(card);
      } else {
        shape.fields.forEach(function (f) {
          var id = 'sec' + section.id + '-' + f.key;
          var input = numberInput(id, section.values[f.key]);
          bindField(input, section, f.key);
          grid.appendChild(field(id, f.label, U, input));
        });
        list.appendChild(h('div', { class: 'sec' }, [head, grid]));
      }
    });

    $('#sections-empty').hidden = state.sections.length > 0;
  }

  function bindField(input, target, key) {
    input.addEventListener('input', function () {
      target.values[key] = num(input.value);
      scheduleUpdate();
    });
  }

  /* ------------------------------------------------------------------
     7. Rendering — openings
     ------------------------------------------------------------------ */
  function renderOpenings() {
    var list = $('#openings-list');
    list.innerHTML = '';
    var U = sys().len;

    state.deductions.forEach(function (d, index) {
      var idW = 'ded' + d.id + '-w', idH = 'ded' + d.id + '-h';
      var iW = numberInput(idW, d.w);
      var iH = numberInput(idH, d.h);
      bindDed(iW, d, 'w');
      bindDed(iH, d, 'h');

      var head = h('div', { class: 'sec__head' }, [
        svgIcon('<rect x="5" y="3.5" width="14" height="17" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="12" cy="13" r="1.2" fill="currentColor"/>'),
        h('div', {}, [
          h('div', { class: 'sec__name', text: d.label || 'Opening ' + (index + 1) }),
          h('div', { class: 'sec__sub', text: 'Deducted from the wall area' })
        ]),
        h('div', { class: 'sec__area' }, [
          'Area',
          h('b', { text: '−' + grouped(d.w * d.h, 1) + ' ' + sys().area })
        ]),
        h('button', {
          type: 'button',
          class: 'icon-btn',
          'aria-label': 'Remove ' + (d.label || 'opening ' + (index + 1)),
          html: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
        })
      ]);
      head.querySelector('.icon-btn').addEventListener('click', function () {
        state.deductions.splice(index, 1);
        renderOpenings();
        renderResults();
      });

      var grid = h('div', { class: 'grid-2' });
      grid.appendChild(field(idW, 'Width', U, iW));
      grid.appendChild(field(idH, 'Height', U, iH));

      list.appendChild(h('div', { class: 'sec' }, [head, grid]));
    });

    $('#openings-empty').hidden = state.deductions.length > 0;
  }

  function bindDed(input, target, key) {
    input.addEventListener('input', function () {
      target[key] = num(input.value);
      scheduleUpdate();
    });
  }

  /* ------------------------------------------------------------------
     8. Calculation
     ------------------------------------------------------------------ */
  function compute() {
    var U = sys(), A = U.area;

    var sectionResults = [];
    var gross = 0;
    state.sections.forEach(function (s, i) {
      var res = shapeArea(s);
      gross += res.area;
      sectionResults.push({ section: s, index: i, area: res.area, slant: res.slant });
    });

    var dedResults = [];
    var deducted = 0;
    state.deductions.forEach(function (d) {
      var a = d.w * d.h;
      deducted += a;
      dedResults.push({ d: d, area: a });
    });

    var net = gross - deducted;
    var clamped = false;
    if (net < 0) { net = 0; clamped = true; }

    var coats = Math.min(4, Math.max(1, Math.round(num(state.coats)) || 1));
    var toCover = net * coats;
    var wastePct = Math.min(20, Math.max(0, num(state.waste)));
    var withWaste = toCover * (1 + wastePct / 100);

    // Coverage: sq ft per gallon internally; metric divides by litres.
    var covSqftPerGal = state.coverage;
    var covDisplay = coverageDisplay();
    var gallons;
    if (state.unit === 'imperial') {
      gallons = covSqftPerGal > 0 ? withWaste / covSqftPerGal : 0;
    } else {
      var litres = covDisplay > 0 ? withWaste / covDisplay : 0;
      gallons = lToGal(litres);
    }
    if (!isFinite(gallons) || gallons < 0) gallons = 0;

    var litres = galToL(gallons);

    // Primary working unit for can planning.
    var amount = state.unit === 'imperial' ? gallons : litres;
    var plan = planCans(amount, U.cans);
    var described = describePlan(plan);

    return {
      sectionResults: sectionResults,
      dedResults: dedResults,
      gross: gross,
      deducted: deducted,
      net: net,
      clamped: clamped,
      coats: coats,
      toCover: toCover,
      wastePct: wastePct,
      withWaste: withWaste,
      gallons: gallons,
      litres: litres,
      amount: amount,
      plan: plan,
      planText: described,
      covDisplay: covDisplay,
      areaUnit: A
    };
  }

  /* ------------------------------------------------------------------
     9. Rendering — results
     ------------------------------------------------------------------ */
  function setText(sel, text) {
    var el = $(sel);
    if (el) el.textContent = text;
  }

  function renderResults() {
    var c = compute();
    var U = sys();
    var A = U.area;
    var covDisplay = c.covDisplay;

    var hasArea = c.gross > 0;

    // --- empty state -------------------------------------------------
    $('#result-empty').hidden = hasArea;
    $('#result-body').hidden = !hasArea;
    $('#mobile-bar').hidden = !hasArea;
    document.body.classList.toggle('has-bar', hasArea);

    if (!hasArea) {
      $('#sections-empty').hidden = state.sections.length > 0;
      return;
    }

    // --- hero --------------------------------------------------------
    var primaryVol = state.unit === 'imperial' ? c.gallons : c.litres;
    var primaryUnit = state.unit === 'imperial' ? 'gallons' : 'litres';
    var secondaryVol = state.unit === 'imperial' ? c.litres : c.gallons;
    var secondaryUnit = state.unit === 'imperial' ? 'litres' : 'gallons';

    setText('#hero-volume', vol(primaryVol));
    setText('#hero-unit', primaryUnit);
    setText('#hero-alt', '≈ ' + vol(secondaryVol) + ' ' + secondaryUnit);

    // --- buy recommendation ------------------------------------------
    var plan = c.plan, pt = c.planText;
    var buyMain, buyDetail, buyAlt = '';

    if (state.unit === 'imperial') {
      buyMain = (plan.length === 1 && plan[0].size === 0.25)
        ? 'Buy 1 quart (0.25 gal)'
        : 'Buy ' + grouped(pt.total, 2) + ' ' + plural(pt.total, 'gallon', 'gallons');
    } else {
      buyMain = 'Buy ' + grouped(pt.total, 2) + ' ' + plural(pt.total, 'litre', 'litres');
    }
    buyDetail = pt.parts;

    var leftover = pt.total - c.amount;
    if (leftover > 0.001) {
      buyDetail += ' · about ' + vol(leftover) + ' ' +
        (state.unit === 'imperial' ? 'gal' : 'L') + ' to spare';
    }

    var big = U.cans[0];
    var bigCount = Math.ceil(c.amount / big.size - 1e-9);
    var planBig = 0;
    plan.forEach(function (p) { if (p.size === big.size) planBig += p.count; });
    if (bigCount !== planBig && c.amount >= 1.5 && bigCount >= 1) {
      buyAlt = 'Or ' + bigCount + ' × ' + big.label + (bigCount > 1 ? ' cans' : ' can') +
               ' — usually the better price per ' + (state.unit === 'imperial' ? 'gallon' : 'litre') + '.';
    }

    setText('#buy-main', buyMain);
    setText('#buy-detail', buyDetail);
    setText('#buy-alt', buyAlt);

    // --- warning ------------------------------------------------------
    var oldWarn = $('#result-warn');
    if (oldWarn) oldWarn.parentNode.removeChild(oldWarn);
    if (c.clamped) {
      var warn = h('div', { class: 'warn', id: 'result-warn' }, [
        h('span', { html: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' }),
        h('span', { text: 'Your openings exceed your wall area — check measurements. Paintable area has been clamped to zero.' })
      ]);
      $('#result-body').insertBefore(warn, $('.result-live'));
    }

    // --- stats --------------------------------------------------------
    setText('#stat-area', grouped(c.net, 1) + ' ' + A);
    setText('#stat-area-note', c.deducted > 0
      ? 'after ' + grouped(c.deducted, 1) + ' ' + A + ' of openings'
      : 'before coats, no openings added');
    setText('#stat-coats', grouped(c.toCover, 1) + ' ' + A);
    setText('#stat-coats-note', c.coats + (c.coats === 1 ? ' coat' : ' coats'));
    setText('#stat-coverage', grouped(covDisplay, covDisplay < 20 ? 1 : 0) + ' ' + U.coverageLabel);
    setText('#stat-waste', c.wastePct + '%');

    // --- breakdown ----------------------------------------------------
    var bl = $('#breakdown-list');
    bl.innerHTML = '';
    c.sectionResults.forEach(function (r) {
      bl.appendChild(h('div', { class: 'bd-row' }, [
        h('span', { class: 'bd-row__name' }, [
          shapeLabel(r.section, r.index),
          h('em', { text: '  ' + SHAPES[r.section.type].hint })
        ]),
        h('span', { class: 'bd-row__val', text: grouped(r.area, 1) + ' ' + A })
      ]));
    });
    c.dedResults.forEach(function (r) {
      bl.appendChild(h('div', { class: 'bd-row bd-row--sub' }, [
        h('span', { class: 'bd-row__name', text: 'Less ' + (r.d.label || 'opening').toLowerCase() }),
        h('span', { class: 'bd-row__val', text: '−' + grouped(r.area, 1) + ' ' + A })
      ]));
    });
    bl.appendChild(h('div', { class: 'bd-row bd-row--total' }, [
      h('span', { class: 'bd-row__name', text: 'Total paintable area' }),
      h('span', { class: 'bd-row__val', text: grouped(c.net, 1) + ' ' + A })
    ]));

    // --- formula transparency panel -----------------------------------
    var fl = $('#formula-list');
    fl.innerHTML = '';

    c.sectionResults.forEach(function (r) {
      fl.appendChild(h('li', {
        html: '<b>' + shapeLabel(r.section, r.index) + '</b> (' +
          SHAPES[r.section.type].hint + '): ' + shapeFormula(r.section, r.area, r.slant)
      }));
    });

    if (c.sectionResults.length > 1) {
      var sumParts = c.sectionResults.map(function (r) { return plain(r.area, 1); }).join(' + ');
      fl.appendChild(h('li', {
        class: 'formula--sum',
        html: 'Gross wall area: ' + sumParts + ' = <b>' + plain(c.gross, 1) + ' ' + A + '</b>'
      }));
    }

    c.dedResults.forEach(function (r) {
      fl.appendChild(h('li', {
        html: 'Less ' + (r.d.label || 'opening').toLowerCase() + ': ' +
          plain(r.d.w) + ' ' + U.len + ' × ' + plain(r.d.h) + ' ' + U.len +
          ' = <b>−' + plain(r.area, 1) + ' ' + A + '</b>'
      }));
    });

    if (c.dedResults.length) {
      fl.appendChild(h('li', {
        class: 'formula--sum',
        html: 'Total paintable: ' + plain(c.gross, 1) + ' − ' + plain(c.deducted, 1) +
          (c.clamped ? ' = <b>0 ' + A + ' (clamped)</b>' : ' = <b>' + plain(c.net, 1) + ' ' + A + '</b>')
      }));
    } else {
      fl.appendChild(h('li', {
        class: 'formula--sum',
        html: 'Total paintable: <b>' + plain(c.net, 1) + ' ' + A + '</b>'
      }));
    }

    fl.appendChild(h('li', {
      html: plain(c.net, 1) + ' ' + A + ' × ' + c.coats + (c.coats === 1 ? ' coat' : ' coats') +
        ' = <b>' + plain(c.toCover, 1) + ' ' + A + '</b>'
    }));

    if (c.wastePct > 0) {
      fl.appendChild(h('li', {
        html: 'Waste allowance ' + c.wastePct + '%: ' + plain(c.toCover, 1) + ' ' + A +
          ' × ' + (1 + c.wastePct / 100).toFixed(2) + ' = <b>' + plain(c.withWaste, 1) + ' ' + A + '</b>'
      }));
    }

    var covStr = grouped(covDisplay, covDisplay < 20 ? 1 : 0) + ' ' + U.coverageLabel;
    if (state.unit === 'imperial') {
      fl.appendChild(h('li', {
        class: 'formula--total',
        html: 'Paint needed: ' + plain(c.withWaste, 1) + ' ' + A + ' ÷ ' + covStr +
          ' = <b>' + plain(c.gallons, 2) + ' gal</b> (' + plain(c.litres, 2) + ' L)'
      }));
    } else {
      fl.appendChild(h('li', {
        class: 'formula--total',
        html: 'Paint needed: ' + plain(c.withWaste, 1) + ' ' + A + ' ÷ ' + covStr +
          ' = <b>' + plain(c.litres, 2) + ' L</b> (' + plain(c.gallons, 2) + ' gal)'
      }));
    }

    fl.appendChild(h('li', {
      class: 'formula--total',
      html: 'Buy: <b>' + buyMain + '</b> (' + buyDetail.split(' · ')[0] + ')'
    }));

    // --- mobile bar ---------------------------------------------------
    setText('#mobile-bar-value', vol(primaryVol) + ' ' + primaryUnit);
  }

  /* ------------------------------------------------------------------
     10. Update scheduling
     ------------------------------------------------------------------ */
  var timer = null;
  function scheduleUpdate() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      renderResults();
      refreshSectionAreas();
    }, 150);
  }

  // Keep the small "Area" chip on each section card in sync without a rebuild.
  function refreshSectionAreas() {
    var cards = $$('#sections-list .sec');
    state.sections.forEach(function (s, i) {
      var card = cards[i];
      if (!card) return;
      var chip = card.querySelector('.sec__area b');
      if (chip) chip.textContent = grouped(shapeArea(s).area, 1) + ' ' + sys().area;
    });
  }

  /* ------------------------------------------------------------------
     11. Settings
     ------------------------------------------------------------------ */
  function syncSettingsInputs() {
    var U = sys();
    $('#coverage').value = plain(coverageDisplay(), coverageDisplay() < 20 ? 1 : 0);
    $('#coverage-unit-label').textContent = U.coverageLabel;
    $('#coverage-hint').textContent = U.coverageHint;

    var dl = $('#coverage-presets');
    dl.innerHTML = '';
    U.coveragePresets.forEach(function (p) {
      dl.appendChild(h('option', { value: String(p) }));
    });

    $('#coats').value = String(state.coats);
    $('#waste').value = String(state.waste);
    $('#waste-out').textContent = state.waste + '%';

    $$('.segmented__btn').forEach(function (b) {
      var on = b.getAttribute('data-unit') === state.unit;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  function switchUnit(next) {
    if (next === state.unit) return;
    var prev = state.unit;

    state.sections.forEach(function (s) {
      Object.keys(s.values).forEach(function (k) {
        s.values[k] = convertLength(s.values[k], prev, next);
      });
    });
    state.deductions.forEach(function (d) {
      d.w = convertLength(d.w, prev, next);
      d.h = convertLength(d.h, prev, next);
    });

    // Coverage: keep the user's physical can rate, unless they never changed it,
    // in which case adopt the default for the new unit system.
    if (!state.coverageTouched) {
      state.coverage = next === 'imperial'
        ? COVERAGE_SQFT_PER_GAL
        : (COVERAGE_M2_PER_L * GAL_TO_L) / SQFT_TO_SQM;
    }

    state.unit = next;
    syncSettingsInputs();
    renderSections();
    renderOpenings();
    renderResults();
  }

  function bindSettings() {
    $$('.segmented__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchUnit(btn.getAttribute('data-unit'));
      });
    });

    var coats = $('#coats');
    coats.addEventListener('input', function () {
      var v = parseInt(coats.value, 10);
      if (!isFinite(v)) v = state.coats;
      v = Math.min(4, Math.max(1, v));
      state.coats = v;
      scheduleUpdate();
    });
    $$('[data-coats]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = btn.getAttribute('data-coats') === 'inc' ? 1 : -1;
        state.coats = Math.min(4, Math.max(1, state.coats + dir));
        coats.value = String(state.coats);
        renderResults();
      });
    });

    var cov = $('#coverage');
    cov.addEventListener('input', function () {
      var v = num(cov.value);
      setCoverageDisplay(v);
      state.coverageTouched = true;
      scheduleUpdate();
    });

    var waste = $('#waste');
    waste.addEventListener('input', function () {
      state.waste = Math.min(20, Math.max(0, parseInt(waste.value, 10) || 0));
      $('#waste-out').textContent = state.waste + '%';
      scheduleUpdate();
    });
  }

  /* ------------------------------------------------------------------
     12. Add section / opening
     ------------------------------------------------------------------ */
  function bindAdders() {
    $$('[data-add-shape]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var section = makeSection(btn.getAttribute('data-add-shape'));
        state.sections.push(section);
        renderSections();
        renderResults();
        var first = document.getElementById('sec' + section.id + '-' + Object.keys(section.values)[0]);
        if (first) first.focus();
      });
    });

    $$('[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-preset');
        var label, w, hh;
        if (kind === 'door') {
          label = 'Door';
          w = PRESETS.door[state.unit].w; hh = PRESETS.door[state.unit].h;
        } else if (kind === 'window') {
          label = 'Window';
          w = PRESETS.window[state.unit].w; hh = PRESETS.window[state.unit].h;
        } else {
          label = 'Opening';
          w = 3; hh = 4;
          if (state.unit === 'metric') { w = 0.9; hh = 1.2; }
        }
        var d = makeDeduction(label, w, hh);
        state.deductions.push(d);
        renderOpenings();
        renderResults();
        var first = document.getElementById('ded' + d.id + '-w');
        if (first) first.focus();
      });
    });
  }

  /* ------------------------------------------------------------------
     13. Init
     ------------------------------------------------------------------ */
  function init() {
    state.sections.push(makeSection('rect'));

    bindSettings();
    bindAdders();

    syncSettingsInputs();
    renderSections();
    renderOpenings();
    renderResults();

    // Open the transparency panel the first time a real calculation appears is
    // intrusive; instead keep it collapsed but always populated.
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
