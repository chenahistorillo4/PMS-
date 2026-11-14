import { canRescheduleAtSameFare, getPassengerFareForTrip } from "./rescheduleBooking";

describe("same-fare rescheduling", () => {
  const booking = {
    status: "confirmed",
    bookingType: "passenger_cargo",
    passengerPrice: 500,
    finalPrice: 650,
    cargoPrice: 150,
  };

  test("allows an unchanged passenger fare and preserves other charges", () => {
    expect(canRescheduleAtSameFare(booking, { price: "500.00" })).toBe(true);
    expect(getPassengerFareForTrip(booking, { price: 500 })).toBe(500);
  });

  test("rejects a changed or invalid fare", () => {
    expect(canRescheduleAtSameFare(booking, { price: 500.01 })).toBe(false);
    expect(canRescheduleAtSameFare(booking, { price: "invalid" })).toBe(false);
  });

  test("does not allow rescheduling cancelled or boarded bookings", () => {
    expect(canRescheduleAtSameFare({ ...booking, status: "cancelled" }, { price: 500 })).toBe(false);
    expect(canRescheduleAtSameFare({ ...booking, status: "boarded" }, { price: 500 })).toBe(false);
  });

  test("cargo-only bookings have no passenger fare", () => {
    expect(getPassengerFareForTrip({ bookingType: "cargo_only" }, { price: "not set" })).toBe(0);
  });
});
