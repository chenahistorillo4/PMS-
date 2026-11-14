export const CARGO_PRICING_BASES = [
  "Per Box",
  "Per Sack",
  "Per Kilo",
  "Per Unit",
  "Per Item",
];

export const DEFAULT_CARGO_TYPES = [
  { name: "Small Grocery Box", pricingBasis: "Per Box" },
  { name: "Medium Grocery Box", pricingBasis: "Per Box" },
  { name: "Large Grocery Box", pricingBasis: "Per Box" },
  { name: "Extra Large Grocery Box", pricingBasis: "Per Box" },
  { name: "Motorcycle", pricingBasis: "Per Unit" },
  { name: "Tricycle", pricingBasis: "Per Unit" },
  { name: "Bicycle", pricingBasis: "Per Unit" },
  { name: "E-bike", pricingBasis: "Per Unit" },
  { name: "Car", pricingBasis: "Per Unit" },
  { name: "Rice Sack", pricingBasis: "Per Sack" },
  { name: "LPG Tank", pricingBasis: "Per Unit" },
  { name: "Refrigerator", pricingBasis: "Per Item" },
  { name: "Washing Machine", pricingBasis: "Per Item" },
  { name: "Furniture", pricingBasis: "Per Item" },
];

export function calculateCargoTotal(price, quantity, pricingBasis) {
  const unitPrice = Number(price);
  const units = Number(quantity);
  const validQuantity = pricingBasis === "Per Kilo"
    ? Number.isFinite(units) && units >= 0
    : Number.isInteger(units) && units >= 0;
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || !validQuantity) {
    return 0;
  }
  return Math.round((unitPrice * units + Number.EPSILON) * 100) / 100;
}

export function isValidCargoPrice(price) {
  return Number.isFinite(Number(price)) && Number(price) >= 0;
}

export function isValidCargoQuantity(quantity, pricingBasis) {
  const units = Number(quantity);
  if (pricingBasis === "Per Kilo") {
    return Number.isFinite(units) &&
      units > 0 &&
      Math.abs(units * 100 - Math.round(units * 100)) < 1e-8;
  }
  return Number.isInteger(units) && units > 0;
}

export function canAcceptBookingForBoarding(
  isPaid,
  bookingStatus,
  cargoSnapshot,
  cargoInspectionStatus
) {
  return isPaid &&
    !["cancelled", "departed", "scanned", "boarded"].includes(
      String(bookingStatus || "").toLowerCase()
    ) &&
    (!cargoSnapshot || cargoInspectionStatus === "verified");
}

export function createCargoBookingSnapshot(cargo, quantity) {
  if (!cargo || !isValidCargoQuantity(quantity, cargo.pricingBasis)) return null;

  const unitPrice = Number(cargo.price);
  const units = Number(quantity);
  if (!isValidCargoPrice(unitPrice)) return null;

  return {
    cargoId: cargo.id,
    name: cargo.name,
    pricingBasis: cargo.pricingBasis,
    unitPrice,
    quantity: units,
    totalPrice: calculateCargoTotal(unitPrice, units, cargo.pricingBasis),
  };
}

export function getDefaultCargoId(cargo) {
  return cargo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
