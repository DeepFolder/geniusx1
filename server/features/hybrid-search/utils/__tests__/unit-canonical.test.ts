import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUnit, splitValueAndUnit, validateUnit } from '../unit-canonical';

test('canonicalUnit: torque variants → N·m', () => {
  assert.equal(canonicalUnit('Nm'), 'N·m');
  assert.equal(canonicalUnit('N.m'), 'N·m');
  assert.equal(canonicalUnit('N·m'), 'N·m');
  assert.equal(canonicalUnit('N\\cdot m'), 'N·m');
  assert.equal(canonicalUnit('N\\\\cdot m'), 'N·m');
  assert.equal(canonicalUnit('\\text{N}\\cdot\\text{m}'), 'N·m');
  assert.equal(canonicalUnit('N \\cdot m'), 'N·m');
});

test('canonicalUnit: m/s² variants', () => {
  assert.equal(canonicalUnit('m/s2'), 'm/s²');
  assert.equal(canonicalUnit('m/s^2'), 'm/s²');
  assert.equal(canonicalUnit('m/s^{2}'), 'm/s²');
  assert.equal(canonicalUnit('m/s²'), 'm/s²');
  assert.equal(canonicalUnit('\\text{m/s}^{2}'), 'm/s²');
});

test('canonicalUnit: kg/m³ variants', () => {
  assert.equal(canonicalUnit('kg/m3'), 'kg/m³');
  assert.equal(canonicalUnit('kg/m^3'), 'kg/m³');
  assert.equal(canonicalUnit('kg/m^{3}'), 'kg/m³');
  assert.equal(canonicalUnit('kg/m³'), 'kg/m³');
});

test('canonicalUnit: simple length units pass through unchanged', () => {
  assert.equal(canonicalUnit('mm'), 'mm');
  assert.equal(canonicalUnit('cm'), 'cm');
  assert.equal(canonicalUnit('m'), 'm');
  assert.equal(canonicalUnit('km'), 'km');
});

test('canonicalUnit: case normalization for frequency units', () => {
  assert.equal(canonicalUnit('rpm'), 'RPM');
  assert.equal(canonicalUnit('RPM'), 'RPM');
  assert.equal(canonicalUnit('hz'), 'Hz');
  assert.equal(canonicalUnit('khz'), 'kHz');
  assert.equal(canonicalUnit('mhz'), 'MHz');
});

test('canonicalUnit: degree forms', () => {
  assert.equal(canonicalUnit('degC'), '°C');
  assert.equal(canonicalUnit('°C'), '°C');
  assert.equal(canonicalUnit('\\degree C'), '°C');
  assert.equal(canonicalUnit('degF'), '°F');
});

test('canonicalUnit: micro prefix', () => {
  assert.equal(canonicalUnit('um'), 'µm');
  assert.equal(canonicalUnit('µm'), 'µm');
  assert.equal(canonicalUnit('\\mu m'), 'µm');
  assert.equal(canonicalUnit('uA'), 'µA');
  assert.equal(canonicalUnit('uF'), 'µF');
});

test('canonicalUnit: ohm', () => {
  assert.equal(canonicalUnit('ohm'), 'Ω');
  assert.equal(canonicalUnit('Ohm'), 'Ω');
  assert.equal(canonicalUnit('\\Omega'), 'Ω');
});

test('canonicalUnit: SI-prefixed units preserve case', () => {
  assert.equal(canonicalUnit('kN'), 'kN');
  assert.equal(canonicalUnit('kW'), 'kW');
  assert.equal(canonicalUnit('MPa'), 'MPa');
  assert.equal(canonicalUnit('mbar'), 'mbar');
  assert.equal(canonicalUnit('mA'), 'mA');
});

test('canonicalUnit: percent', () => {
  assert.equal(canonicalUnit('%'), '%');
  assert.equal(canonicalUnit('\\%'), '%');
});

test('canonicalUnit: empty / dimensionless / null', () => {
  assert.equal(canonicalUnit(''), '');
  assert.equal(canonicalUnit(null), '');
  assert.equal(canonicalUnit(undefined), '');
  assert.equal(canonicalUnit('-'), '');
  assert.equal(canonicalUnit('–'), '');
  assert.equal(canonicalUnit('1'), '');
  assert.equal(canonicalUnit('  '), '');
});

test('canonicalUnit: compound units preserve parens and middle dots', () => {
  assert.equal(canonicalUnit('W/(m·K)'), 'W/(m·K)');
  assert.equal(canonicalUnit('W/(m\\cdot K)'), 'W/(m·K)');
  assert.equal(canonicalUnit('kg·m^{2}/s^{3}'), 'kg·m²/s³');
  assert.equal(canonicalUnit('N·m/rad'), 'N·m/rad');
});

test('canonicalUnit: idempotent', () => {
  const inputs = ['N·m', 'm/s²', 'kg/m³', '°C', 'µm', 'Ω', 'RPM', 'kHz', 'W/(m·K)', ''];
  for (const u of inputs) {
    assert.equal(canonicalUnit(canonicalUnit(u)), canonicalUnit(u), `idempotency failed for: ${u}`);
  }
});

test('canonicalUnit: never mangles "mm"/"cm"/"kg" via the glued-pair allowlist', () => {
  assert.equal(canonicalUnit('mm'), 'mm');
  assert.equal(canonicalUnit('cm'), 'cm');
  assert.equal(canonicalUnit('kg'), 'kg');
  assert.equal(canonicalUnit('Pa'), 'Pa');
});

test('splitValueAndUnit: plain "234.5 N"', () => {
  assert.deepEqual(splitValueAndUnit('234.5 N'), { value: '234.5', unit: 'N' });
});

test('splitValueAndUnit: latex blob', () => {
  assert.deepEqual(splitValueAndUnit('\\( 234.5 \\text{ N} \\)'), { value: '234.5', unit: 'N' });
  assert.deepEqual(splitValueAndUnit('234.5 \\text{ N}'), { value: '234.5', unit: 'N' });
});

test('splitValueAndUnit: composite units', () => {
  assert.deepEqual(splitValueAndUnit('11.11 m/s'), { value: '11.11', unit: 'm/s' });
  assert.deepEqual(splitValueAndUnit('500 N\\cdot m'), { value: '500', unit: 'N·m' });
  assert.deepEqual(splitValueAndUnit('9.81 m/s^{2}'), { value: '9.81', unit: 'm/s²' });
});

test('splitValueAndUnit: leaves formulas alone', () => {
  assert.deepEqual(splitValueAndUnit('v = 11.11 m/s'), { value: 'v = 11.11 m/s', unit: '' });
  assert.deepEqual(splitValueAndUnit('5 × 10^3'), { value: '5 × 10^3', unit: '' });
});

test('splitValueAndUnit: empty / null', () => {
  assert.deepEqual(splitValueAndUnit(''), { value: '', unit: '' });
  assert.deepEqual(splitValueAndUnit(null), { value: '', unit: '' });
  assert.deepEqual(splitValueAndUnit('1500'), { value: '1500', unit: '' });
});

test('validateUnit: warns on raw LaTeX in unit field', () => {
  const r = validateUnit('N\\cdot m');
  assert.equal(r.ok, false);
  assert.match(r.warnings[0], /LaTeX/);
});

test('validateUnit: warns on value+unit blob', () => {
  const r = validateUnit('234.5 N');
  assert.equal(r.ok, false);
  assert.match(r.warnings[0], /value\+unit/);
});

test('validateUnit: clean inputs pass', () => {
  assert.equal(validateUnit('N·m').ok, true);
  assert.equal(validateUnit('m/s²').ok, true);
  assert.equal(validateUnit('').ok, true);
  assert.equal(validateUnit('kN').ok, true);
});

test('canonicalUnit: compound units with parens and middle dot', () => {
  assert.equal(canonicalUnit('W/(m·K)'), 'W/(m·K)');
  assert.equal(canonicalUnit('W/(m\\cdot K)'), 'W/(m·K)');
  assert.equal(canonicalUnit('kg·m^{2}/s^{3}'), 'kg·m²/s³');
  assert.equal(canonicalUnit('kg\\cdot m^2/s^3'), 'kg·m²/s³');
  assert.equal(canonicalUnit('N·m/rad'), 'N·m/rad');
  assert.equal(canonicalUnit('N\\cdot m/rad'), 'N·m/rad');
});

test('canonicalUnit: idempotent across the table', () => {
  const inputs = [
    'Nm', 'N·m', 'm/s2', 'm/s²', 'kg/m^{3}', 'kg/m³',
    'um', 'µm', 'ohm', 'Ω', 'degC', '°C',
    'rpm', 'RPM', 'khz', 'kHz', 'MHz', 'GHz',
    'kN', 'MPa', 'mbar', 'µA',
    'W/(m·K)', 'kg·m²/s³', 'N·m/rad',
    'Δp', 'Ω·m', '%', '',
  ];
  for (const input of inputs) {
    const once = canonicalUnit(input);
    const twice = canonicalUnit(once);
    assert.equal(twice, once, `idempotency broke for ${JSON.stringify(input)}: ${JSON.stringify(once)} → ${JSON.stringify(twice)}`);
  }
});

test('canonicalUnit: Greek-bearing units', () => {
  assert.equal(canonicalUnit('um'), 'µm');
  assert.equal(canonicalUnit('µm'), 'µm');
  assert.equal(canonicalUnit('\\mu m'), 'µm');
  assert.equal(canonicalUnit('Ω·m'), 'Ω·m');
  assert.equal(canonicalUnit('\\Omega\\cdot m'), 'Ω·m');
  assert.equal(canonicalUnit('Δp'), 'Δp');
  assert.equal(canonicalUnit('\\Delta p'), 'Δp');
});

test('canonicalUnit: frequency casing edges', () => {
  assert.equal(canonicalUnit('RPM'), 'RPM');
  assert.equal(canonicalUnit('Hz'), 'Hz');
  assert.equal(canonicalUnit('kHz'), 'kHz');
  assert.equal(canonicalUnit('KHz'), 'kHz');
  assert.equal(canonicalUnit('MHz'), 'MHz');
  assert.equal(canonicalUnit('mhz'), 'MHz');
  assert.equal(canonicalUnit('ghz'), 'GHz');
});

test('canonicalUnit: SI prefixes preserved (no spurious middle-dot insertion)', () => {
  assert.equal(canonicalUnit('kN'), 'kN');
  assert.equal(canonicalUnit('MPa'), 'MPa');
  assert.equal(canonicalUnit('mbar'), 'mbar');
  assert.equal(canonicalUnit('µA'), 'µA');
  assert.equal(canonicalUnit('uA'), 'µA');
  assert.equal(canonicalUnit('mm'), 'mm');
  assert.equal(canonicalUnit('cm'), 'cm');
  assert.equal(canonicalUnit('kg'), 'kg');
});
