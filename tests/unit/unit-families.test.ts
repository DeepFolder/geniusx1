import { describe, it, expect } from 'vitest';
import { getUnitFamily, convertUnitValue, formatConvertedValue } from '../../shared/unit-families';

describe('unit families', () => {
  it('finds families via canonicalization', () => {
    expect(getUnitFamily('N')?.name).toBe('force');
    expect(getUnitFamily('N\\cdot m')?.name).toBe('moment');
    expect(getUnitFamily('Nm')?.name).toBe('moment');
    expect(getUnitFamily('MPa')?.name).toBe('pressure');
    expect(getUnitFamily('rpm')?.name).toBe('rotational speed');
    expect(getUnitFamily('foobar')).toBeNull();
    expect(getUnitFamily('')).toBeNull();
  });

  it('converts linear units', () => {
    expect(convertUnitValue(5000, 'N', 'kN')).toBe(5);
    expect(convertUnitValue(5, 'kN', 'N')).toBe(5000);
    expect(convertUnitValue(2, 'MPa', 'bar')).toBe(20);
    expect(convertUnitValue(0.25, 'm', 'mm')).toBe(250);
    expect(convertUnitValue(1500, 'W', 'kW')).toBe(1.5);
  });

  it('converts affine temperature units', () => {
    expect(convertUnitValue(25, '°C', 'K')).toBeCloseTo(298.15);
    expect(convertUnitValue(300, 'K', '°C')).toBeCloseTo(26.85);
  });

  it('converts rotational speed', () => {
    expect(convertUnitValue(3000, 'RPM', 'rad/s')).toBeCloseTo(314.159265, 5);
  });

  it('rejects cross-family or unknown conversions', () => {
    expect(convertUnitValue(1, 'N', 'W')).toBeNull();
    expect(convertUnitValue(1, 'N', 'nope')).toBeNull();
    expect(convertUnitValue(NaN, 'N', 'kN')).toBeNull();
  });

  it('formats without float noise', () => {
    expect(formatConvertedValue(convertUnitValue(0.1, 'm', 'mm')!)).toBe('100');
    expect(formatConvertedValue(convertUnitValue(4.9999999999999995, 'kN', 'kN') ?? 5)).toBe('5');
  });
});
