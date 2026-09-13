/**
 * Re-exports the canonical unit pipeline from the shared module so all
 * existing server-side imports continue to work without modification.
 */
export {
  canonicalUnit,
  splitValueAndUnit,
  canonicalizeUnitTokensInCell,
  validateUnit,
} from '@shared/unit-canonical';
