function calculateMinorUnits({ quantity, unitPriceMinor, currency = "USD" }) {
  const q = BigInt(quantity); const p = BigInt(unitPriceMinor);
  if (q < 0n || p < 0n || !/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid exact-price input");
  return { amountMinor: (q * p).toString(), currency, estimated: true };
}
module.exports = { calculateMinorUnits };
