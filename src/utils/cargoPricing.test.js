import {
  calculateCargoTotal,
  canAcceptBookingForBoarding,
  createCargoBookingSnapshot,
  getDefaultCargoId,
  isValidCargoPrice,
  isValidCargoQuantity,
} from "./cargoPricing";

describe("cargo pricing", () => {
  test("calculates totals from per-unit price and quantity", () => {
    expect(calculateCargoTotal(125.5, 3)).toBe(376.5);
    expect(calculateCargoTotal(80, 1.5, "Per Kilo")).toBe(120);
  });

  test("rounds totals to cents and rejects invalid values", () => {
    expect(calculateCargoTotal(10.005, 2)).toBe(20.01);
    expect(calculateCargoTotal(-1, 2)).toBe(0);
    expect(calculateCargoTotal(10, 1.5)).toBe(0);
  });

  test("validates prices and whole positive quantities", () => {
    expect(isValidCargoPrice("100")).toBe(true);
    expect(isValidCargoPrice("-1")).toBe(false);
    expect(isValidCargoQuantity("2")).toBe(true);
    expect(isValidCargoQuantity("1.5")).toBe(false);
    expect(isValidCargoQuantity("0")).toBe(false);
    expect(isValidCargoQuantity("1.5", "Per Kilo")).toBe(true);
    expect(isValidCargoQuantity("0.25", "Per Kilo")).toBe(true);
    expect(isValidCargoQuantity("1.234", "Per Kilo")).toBe(false);
    expect(isValidCargoQuantity("0", "Per Kilo")).toBe(false);
  });

  test("captures the chosen price and declaration for a booking", () => {
    const snapshot = createCargoBookingSnapshot({
      id: "small-box",
      name: "Small Grocery Box",
      size: "Small",
      pricingBasis: "Per Box",
      price: 75,
    }, 2);

    expect(snapshot).toEqual({
      cargoId: "small-box",
      name: "Small Grocery Box",
      pricingBasis: "Per Box",
      unitPrice: 75,
      quantity: 2,
      totalPrice: 150,
    });
    expect(createCargoBookingSnapshot(null, 2)).toBeNull();
    expect(createCargoBookingSnapshot({ price: 75 }, 0)).toBeNull();
  });

  test("supports fractional kilo snapshots and calculates their total", () => {
    expect(createCargoBookingSnapshot({
      id: "bulk-cargo",
      name: "Bulk Cargo",
      pricingBasis: "Per Kilo",
      price: 80,
    }, "1.5")).toEqual({
      cargoId: "bulk-cargo",
      name: "Bulk Cargo",
      pricingBasis: "Per Kilo",
      unitPrice: 80,
      quantity: 1.5,
      totalPrice: 120,
    });
  });

  test("creates stable IDs for suggested cargo types", () => {
    expect(getDefaultCargoId({
      name: "Extra Large Grocery Box",
    })).toBe("extra-large-grocery-box");
  });

  test("requires paid bookings and verified cargo inspection before boarding", () => {
    const cargo = { name: "Small Grocery Box" };
    expect(canAcceptBookingForBoarding(true, "confirmed", null, "pending")).toBe(true);
    expect(canAcceptBookingForBoarding(false, "confirmed", null, "pending")).toBe(false);
    expect(canAcceptBookingForBoarding(true, "confirmed", cargo, "pending")).toBe(false);
    expect(canAcceptBookingForBoarding(true, "confirmed", cargo, "verified")).toBe(true);
    expect(canAcceptBookingForBoarding(true, "cancelled", cargo, "verified")).toBe(false);
  });
});
