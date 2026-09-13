/**
 * Unit family catalog — client-side unit switching for input values.
 *
 * Each family groups related units of the same physical quantity with a
 * conversion factor to a base unit (value_in_base = value * factor, or for
 * affine units like °C, value_in_base = value * factor + offset).
 *
 * Lookup is by the CANONICAL unit string (see unit-canonical.ts), so callers
 * should pass units through canonicalUnit() before lookup — getUnitFamily()
 * does this internally.
 *
 * Pure TypeScript — zero Node.js dependencies, safe to import in the browser.
 */

import { canonicalUnit } from './unit-canonical';

export interface FamilyUnit {
  /** Canonical display symbol, e.g. 'kN', 'N·m', '°C'. */
  unit: string;
  /** Multiplier to the family's base unit. */
  factor: number;
  /** Additive offset (after multiplying), for affine scales like °C→K. */
  offset?: number;
}

export interface UnitFamily {
  name: string;
  units: FamilyUnit[];
}

const FAMILIES: UnitFamily[] = [
  { name: 'force', units: [
    { unit: 'N', factor: 1 },
    { unit: 'kN', factor: 1e3 },
    { unit: 'MN', factor: 1e6 },
  ]},
  { name: 'power', units: [
    { unit: 'W', factor: 1 },
    { unit: 'kW', factor: 1e3 },
    { unit: 'MW', factor: 1e6 },
  ]},
  { name: 'pressure', units: [
    { unit: 'Pa', factor: 1 },
    { unit: 'kPa', factor: 1e3 },
    { unit: 'MPa', factor: 1e6 },
    { unit: 'GPa', factor: 1e9 },
    { unit: 'bar', factor: 1e5 },
    { unit: 'N/mm²', factor: 1e6 },
  ]},
  { name: 'length', units: [
    { unit: 'µm', factor: 1e-6 },
    { unit: 'mm', factor: 1e-3 },
    { unit: 'cm', factor: 1e-2 },
    { unit: 'm', factor: 1 },
    { unit: 'km', factor: 1e3 },
  ]},
  { name: 'area', units: [
    { unit: 'mm²', factor: 1e-6 },
    { unit: 'cm²', factor: 1e-4 },
    { unit: 'm²', factor: 1 },
  ]},
  { name: 'volume', units: [
    { unit: 'mm³', factor: 1e-9 },
    { unit: 'cm³', factor: 1e-6 },
    { unit: 'L', factor: 1e-3 },
    { unit: 'm³', factor: 1 },
  ]},
  { name: 'moment', units: [
    { unit: 'N·mm', factor: 1e-3 },
    { unit: 'N·m', factor: 1 },
    { unit: 'kN·m', factor: 1e3 },
  ]},
  { name: 'mass', units: [
    { unit: 'g', factor: 1e-3 },
    { unit: 'kg', factor: 1 },
    { unit: 't', factor: 1e3 },
  ]},
  { name: 'speed', units: [
    { unit: 'mm/s', factor: 1e-3 },
    { unit: 'm/s', factor: 1 },
    { unit: 'km/h', factor: 1 / 3.6 },
  ]},
  { name: 'rotational speed', units: [
    { unit: 'RPM', factor: 1 },
    { unit: 'rad/s', factor: 60 / (2 * Math.PI) },
    { unit: 'Hz', factor: 60 },
  ]},
  { name: 'frequency', units: [
    { unit: 'Hz', factor: 1 },
    { unit: 'kHz', factor: 1e3 },
    { unit: 'MHz', factor: 1e6 },
  ]},
  { name: 'temperature', units: [
    { unit: 'K', factor: 1 },
    { unit: '°C', factor: 1, offset: 273.15 },
  ]},
  { name: 'time', units: [
    { unit: 'ms', factor: 1e-3 },
    { unit: 's', factor: 1 },
    { unit: 'min', factor: 60 },
    { unit: 'h', factor: 3600 },
  ]},
  { name: 'energy', units: [
    { unit: 'J', factor: 1 },
    { unit: 'kJ', factor: 1e3 },
    { unit: 'MJ', factor: 1e6 },
    { unit: 'W·h', factor: 3600 },
    { unit: 'kWh', factor: 3.6e6 },
  ]},
  { name: 'voltage', units: [
    { unit: 'mV', factor: 1e-3 },
    { unit: 'V', factor: 1 },
    { unit: 'kV', factor: 1e3 },
  ]},
  { name: 'current', units: [
    { unit: 'µA', factor: 1e-6 },
    { unit: 'mA', factor: 1e-3 },
    { unit: 'A', factor: 1 },
  ]},
  { name: 'flow rate', units: [
    { unit: 'L/min', factor: 1 / 60000 },
    { unit: 'L/s', factor: 1e-3 },
    { unit: 'm³/s', factor: 1 },
    { unit: 'm³/h', factor: 1 / 3600 },
  ]},
];

// Note on ambiguous units: 'Hz' appears in both 'rotational speed' and
// 'frequency'; lookup maps each unit to the FIRST family that declares it,
// so 'Hz' resolves to 'rotational speed'... which is wrong for most cases.
// To avoid that, we build the index frequency-first for Hz by declaring
// explicit priority below.
const LOOKUP_PRIORITY = ['frequency'];

const UNIT_TO_FAMILY = new Map<string, UnitFamily>();
for (const famName of LOOKUP_PRIORITY) {
  const fam = FAMILIES.find((f) => f.name === famName);
  if (fam) for (const u of fam.units) {
    if (!UNIT_TO_FAMILY.has(u.unit)) UNIT_TO_FAMILY.set(u.unit, fam);
  }
}
for (const fam of FAMILIES) {
  for (const u of fam.units) {
    if (!UNIT_TO_FAMILY.has(u.unit)) UNIT_TO_FAMILY.set(u.unit, fam);
  }
}

/** Return the unit family for a (possibly non-canonical) unit string, or null. */
export function getUnitFamily(rawUnit: unknown): UnitFamily | null {
  const c = canonicalUnit(rawUnit as string);
  if (!c) return null;
  return UNIT_TO_FAMILY.get(c) ?? null;
}

/**
 * Convert a numeric value from one unit to another within the same family.
 * Returns null when the units are not in the same family or the value is
 * not a finite number.
 */
export function convertUnitValue(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (!Number.isFinite(value)) return null;
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  const fam = UNIT_TO_FAMILY.get(from);
  if (!fam || fam !== UNIT_TO_FAMILY.get(to)) return null;
  const fu = fam.units.find((u) => u.unit === from);
  const tu = fam.units.find((u) => u.unit === to);
  if (!fu || !tu) return null;
  const base = value * fu.factor + (fu.offset ?? 0);
  return (base - (tu.offset ?? 0)) / tu.factor;
}

/**
 * Format a converted value for display in an editable input: keep it exact
 * where possible, otherwise round to a sensible number of significant digits
 * to avoid binary-float noise like 4.999999999999999.
 */
export function formatConvertedValue(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  // Round to 12 significant digits to strip float noise, then drop
  // trailing zeros via Number round-trip.
  const rounded = Number(n.toPrecision(12));
  return String(rounded);
}
