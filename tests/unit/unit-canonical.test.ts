import { describe, test, expect } from 'vitest';
import { canonicalUnit } from '../../shared/unit-canonical';

describe('canonicalUnit — shared module (client + server)', () => {
  test('torque: Nm and variants → N·m', () => {
    expect(canonicalUnit('Nm')).toBe('N·m');
    expect(canonicalUnit('N.m')).toBe('N·m');
    expect(canonicalUnit('N·m')).toBe('N·m');
    expect(canonicalUnit('N\\cdot m')).toBe('N·m');
    expect(canonicalUnit('N\\\\cdot m')).toBe('N·m');
    expect(canonicalUnit('\\text{N}\\cdot\\text{m}')).toBe('N·m');
  });

  test('energy: Wh → W·h', () => {
    expect(canonicalUnit('Wh')).toBe('W·h');
  });

  test('viscosity: Pa.s / Pas → Pa·s', () => {
    expect(canonicalUnit('Pa.s')).toBe('Pa·s');
    expect(canonicalUnit('Pas')).toBe('Pa·s');
  });

  test('acceleration: m/s2 → m/s²', () => {
    expect(canonicalUnit('m/s2')).toBe('m/s²');
    expect(canonicalUnit('m/s^2')).toBe('m/s²');
    expect(canonicalUnit('m/s^{2}')).toBe('m/s²');
    expect(canonicalUnit('m/s²')).toBe('m/s²');
  });

  test('density: kg/m3 → kg/m³', () => {
    expect(canonicalUnit('kg/m3')).toBe('kg/m³');
    expect(canonicalUnit('kg/m^3')).toBe('kg/m³');
    expect(canonicalUnit('kg/m^{3}')).toBe('kg/m³');
    expect(canonicalUnit('kg/m³')).toBe('kg/m³');
  });

  test('temperature: degC → °C', () => {
    expect(canonicalUnit('degC')).toBe('°C');
    expect(canonicalUnit('°C')).toBe('°C');
    expect(canonicalUnit('\\degree C')).toBe('°C');
    expect(canonicalUnit('degF')).toBe('°F');
  });

  test('micro prefix: um → µm', () => {
    expect(canonicalUnit('um')).toBe('µm');
    expect(canonicalUnit('µm')).toBe('µm');
    expect(canonicalUnit('uA')).toBe('µA');
    expect(canonicalUnit('uF')).toBe('µF');
  });

  test('ohm → Ω', () => {
    expect(canonicalUnit('ohm')).toBe('Ω');
    expect(canonicalUnit('Ohm')).toBe('Ω');
    expect(canonicalUnit('\\Omega')).toBe('Ω');
  });

  test('simple length units pass through unchanged', () => {
    expect(canonicalUnit('mm')).toBe('mm');
    expect(canonicalUnit('cm')).toBe('cm');
    expect(canonicalUnit('m')).toBe('m');
    expect(canonicalUnit('km')).toBe('km');
  });

  test('SI-prefixed units preserve case', () => {
    expect(canonicalUnit('kN')).toBe('kN');
    expect(canonicalUnit('kW')).toBe('kW');
    expect(canonicalUnit('MPa')).toBe('MPa');
    expect(canonicalUnit('mA')).toBe('mA');
  });

  test('compound units with parens and middle dot', () => {
    expect(canonicalUnit('W/(m·K)')).toBe('W/(m·K)');
    expect(canonicalUnit('N·m/rad')).toBe('N·m/rad');
  });

  test('idempotent — applying twice gives same result', () => {
    const cases = ['Nm', 'N.m', 'Wh', 'Pas', 'm/s2', 'kg/m3', 'degC', 'um', 'ohm', 'N·m', '°C'];
    for (const u of cases) {
      const once = canonicalUnit(u);
      expect(canonicalUnit(once)).toBe(once);
    }
  });

  test('empty / null / dimensionless → empty string', () => {
    expect(canonicalUnit('')).toBe('');
    expect(canonicalUnit(null)).toBe('');
    expect(canonicalUnit(undefined)).toBe('');
    expect(canonicalUnit('-')).toBe('');
    expect(canonicalUnit('1')).toBe('');
  });
});
