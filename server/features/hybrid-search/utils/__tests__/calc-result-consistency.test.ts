import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitValueAndUnit, canonicalUnit } from '../unit-canonical';

// Mirror of parseValueUnitString in agent-search.ts (string path only).
// Kept local to the test to avoid pulling the full agent-search module
// (and its OpenAI deps) into a unit test.
function parseStringResult(raw: any): { value: string; unit?: string } | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'object') {
    const v = String((raw as any).value ?? '');
    const u = (raw as any).unit ? String((raw as any).unit) : '';
    if (!v && !u) return undefined;
    return { value: v, unit: canonicalUnit(u) || undefined };
  }
  const str = String(raw).trim();
  if (!str) return undefined;
  const split = splitValueAndUnit(str);
  if (split.unit) return { value: split.value, unit: split.unit || undefined };
  return { value: str, unit: undefined };
}

// Mirror of checkCalcConsistency in agent-search.ts. Compares against the
// FINAL step entry only — never the last numeric step. Returns the warning
// text when one would be emitted, or null when silent.
function consistencyWarn(
  finalVal: string,
  finalUnit: string,
  finalName: string,
  steps: Array<{ result?: { value?: string; unit?: string } }>,
): string | null {
  if (!finalVal) return null;
  if (steps.length === 0) return null;
  const finalStep = steps[steps.length - 1];
  const stepVal = finalStep.result?.value;
  if (!stepVal) return null;
  const numRe = /^\s*(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/;
  const fMatch = String(finalVal).match(numRe);
  const sMatch = String(stepVal).match(numRe);
  if (!fMatch || !sMatch) return null;
  const fNum = Number(fMatch[0]);
  const sNum = Number(sMatch[0]);
  if (!Number.isFinite(fNum) || !Number.isFinite(sNum) || sNum === 0) return null;
  const rel = Math.abs(fNum - sNum) / Math.abs(sNum);
  if (rel <= 0.01) return null;
  const stepUnit = finalStep.result?.unit ?? '';
  return `result.value=${finalVal}${finalUnit ? ' ' + finalUnit : ''} differs from final step result=${stepVal}${stepUnit ? ' ' + stepUnit : ''} for symbol ${finalName || '(unnamed)'}`;
}

test('cs.result string: "1.5 m/s" → { value: "1.5", unit: "m/s" }', () => {
  assert.deepEqual(parseStringResult('1.5 m/s'), { value: '1.5', unit: 'm/s' });
});

test('cs.result string: "645 N" → { value: "645", unit: "N" }', () => {
  assert.deepEqual(parseStringResult('645 N'), { value: '645', unit: 'N' });
});

test('cs.result string: "150 Nm" canonicalizes torque', () => {
  assert.deepEqual(parseStringResult('150 Nm'), { value: '150', unit: 'N·m' });
});

test('cs.result string: "40 degC" canonicalizes to °C', () => {
  assert.deepEqual(parseStringResult('40 degC'), { value: '40', unit: '°C' });
});

test('cs.result string: dimensionless "0.85" keeps no unit', () => {
  assert.deepEqual(parseStringResult('0.85'), { value: '0.85', unit: undefined });
});

test('cs.result object path unchanged', () => {
  assert.deepEqual(
    parseStringResult({ value: '1.5', unit: 'm/s' }),
    { value: '1.5', unit: 'm/s' }
  );
});

test('cs.result empty / null → undefined', () => {
  assert.equal(parseStringResult(''), undefined);
  assert.equal(parseStringResult(null), undefined);
  assert.equal(parseStringResult(undefined), undefined);
});

test('consistency: matching values → no warning', () => {
  const w = consistencyWarn('1.5', 'm/s', 'V_{acc}', [
    { result: { value: '0.5', unit: 'm/s²' } },
    { result: { value: '1.5', unit: 'm/s' } },
  ]);
  assert.equal(w, null);
});

test('consistency: rounding within 1% → silent', () => {
  const w = consistencyWarn('1.50', 'm/s', 'V_{acc}', [
    { result: { value: '1.504', unit: 'm/s' } },
  ]);
  assert.equal(w, null);
});

test('consistency: >1% mismatch → warning string', () => {
  const w = consistencyWarn('2.5', 'm/s', 'V_{acc}', [
    { result: { value: '1.5', unit: 'm/s' } },
  ]);
  assert.ok(w);
  assert.match(w!, /V_\{acc\}/);
  assert.match(w!, /2\.5/);
  assert.match(w!, /1\.5/);
});

test('consistency: final step has no numeric value → silent', () => {
  const w = consistencyWarn('1.5', 'm/s', 'V_{acc}', [
    { result: { value: 'see formula', unit: '' } },
  ]);
  assert.equal(w, null);
});

test('consistency: final step is non-numeric, prior step matches → still silent (final-step-only semantics)', () => {
  // Earlier numeric step (1.5) coincidentally agrees with the final result,
  // but the FINAL step is descriptive-only. The checker must NOT pick the
  // earlier numeric step — it must compare against the final step entry
  // and remain silent.
  const w = consistencyWarn('1.5', 'm/s', 'V_{acc}', [
    { result: { value: '1.5', unit: 'm/s' } },
    { result: { value: 'apply 25% safety margin', unit: '' } },
  ]);
  assert.equal(w, null);
});

test('consistency: final step is non-numeric while earlier step disagrees → still silent (no false positives)', () => {
  // Earlier numeric step (0.5) disagrees with the final result (1.5).
  // The checker must still be silent because the final step has no
  // numeric value — we never reach back to the earlier step.
  const w = consistencyWarn('1.5', 'm/s', 'V_{acc}', [
    { result: { value: '0.5', unit: 'm/s²' } },
    { result: { value: 'see derivation', unit: '' } },
  ]);
  assert.equal(w, null);
});

test('consistency: empty final result → silent', () => {
  const w = consistencyWarn('', '', '', [
    { result: { value: '1.5', unit: 'm/s' } },
  ]);
  assert.equal(w, null);
});

test('consistency: no steps → silent', () => {
  assert.equal(consistencyWarn('1.5', 'm/s', 'V_{acc}', []), null);
});
