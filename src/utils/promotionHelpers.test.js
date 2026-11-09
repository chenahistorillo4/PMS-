import {
  calculatePromoDiscount,
  getActivePromo,
  getPromoReservationCounts,
} from "./promotionHelpers";

describe("promo helpers", () => {
  test("selects the highest valid active percentage promo", () => {
    const activePromo = getActivePromo([
      { id: "inactive", percentage: 80, active: false },
      { id: "smaller", percentage: 10, active: true },
      { id: "larger", percentage: 15, active: true },
      { id: "invalid", percentage: 120, active: true },
    ]);

    expect(activePromo.id).toBe("larger");
  });

  test("calculates a promo on the balance remaining after another discount", () => {
    const fareAfterPassengerDiscount = 90;
    const promoDiscount = calculatePromoDiscount(fareAfterPassengerDiscount, {
      percentage: 10,
      active: true,
    });

    expect(promoDiscount).toBe(9);
    expect(fareAfterPassengerDiscount - promoDiscount).toBe(81);
  });

  test("ignores invalid percentages and negative fares", () => {
    expect(calculatePromoDiscount(100, { percentage: 101, active: true })).toBe(0);
    expect(calculatePromoDiscount(-100, { percentage: 10, active: true })).toBe(0);
  });

  test("filters promos by status, date range, and reservation limit", () => {
    const currentDate = new Date(2026, 10, 8);
    const promos = [
      { id: "inactive", percentage: 30, active: false },
      { id: "upcoming", percentage: 25, active: true, startDate: "2026-11-09", endDate: "2026-11-30" },
      { id: "expired", percentage: 20, active: true, startDate: "2026-10-01", endDate: "2026-11-07" },
      { id: "sold-out", percentage: 15, active: true, availability: "limited", maxReservations: 2 },
      { id: "available", percentage: 10, active: true, availability: "limited", maxReservations: 3 },
    ];

    expect(getActivePromo(promos, { "sold-out": 2, available: 2 }, currentDate).id).toBe("available");
    expect(getActivePromo(promos, { "sold-out": 2, available: 3 }, currentDate)).toBeNull();
  });

  test("counts non-cancelled reservations against promo limits", () => {
    expect(getPromoReservationCounts([
      { promoId: "spring", status: "pending" },
      { promoId: "spring", status: "confirmed" },
      { promoId: "spring", status: "cancelled" },
    ])).toEqual({ spring: 2 });
  });
});
