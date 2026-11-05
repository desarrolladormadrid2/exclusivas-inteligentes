export const EQUIVALENCE_SURCHARGE_RATES = Object.freeze({
  0: 0,
  4: 0.5,
  10: 1.4,
  21: 5.2,
});

const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function equivalenceSurchargeRate(vatRate) {
  const normalized = Number(vatRate || 0);
  return Object.prototype.hasOwnProperty.call(EQUIVALENCE_SURCHARGE_RATES, normalized)
    ? EQUIVALENCE_SURCHARGE_RATES[normalized]
    : 0;
}

export function calculateInvoiceTotals(lines = [], equivalenceSurchargeEnabled = false) {
  const breakdown = new Map();
  const calculatedLines = (Array.isArray(lines) ? lines : []).map((line) => {
    const quantity = Number(line.quantity || 0);
    const unitPrice = Number(line.unit_price || 0);
    const discount = Number(line.discount || 0);
    const base = round2(line.amount !== undefined && line.amount !== null && line.amount !== ""
      ? Number(line.amount || 0)
      : quantity * unitPrice * (1 - discount / 100));
    const vat = Number(line.vat || 0);
    const vatAmount = round2(base * vat / 100);
    const surchargePercent = equivalenceSurchargeEnabled ? equivalenceSurchargeRate(vat) : 0;
    const surchargeAmount = round2(base * surchargePercent / 100);
    const key = String(vat);
    const previous = breakdown.get(key) || { vat_rate: vat, base_amount: 0, vat_amount: 0, surcharge_rate: surchargePercent, surcharge_amount: 0 };
    previous.base_amount = round2(previous.base_amount + base);
    previous.vat_amount = round2(previous.vat_amount + vatAmount);
    previous.surcharge_amount = round2(previous.surcharge_amount + surchargeAmount);
    breakdown.set(key, previous);
    return { ...line, amount: base, vat_amount: vatAmount, equivalence_surcharge_percent: surchargePercent, equivalence_surcharge_amount: surchargeAmount };
  });
  const baseAmount = round2(calculatedLines.reduce((sum, line) => sum + Number(line.amount || 0), 0));
  const vatAmount = round2(calculatedLines.reduce((sum, line) => sum + Number(line.vat_amount || 0), 0));
  const equivalenceSurchargeAmount = round2(calculatedLines.reduce((sum, line) => sum + Number(line.equivalence_surcharge_amount || 0), 0));
  return {
    lines: calculatedLines,
    base_amount: baseAmount,
    vat_amount: vatAmount,
    equivalence_surcharge_enabled: Boolean(equivalenceSurchargeEnabled),
    equivalence_surcharge_amount: equivalenceSurchargeAmount,
    equivalence_surcharge_breakdown: [...breakdown.values()].filter((row) => row.base_amount || row.vat_amount || row.surcharge_amount),
    total_amount: round2(baseAmount + vatAmount + equivalenceSurchargeAmount),
  };
}
