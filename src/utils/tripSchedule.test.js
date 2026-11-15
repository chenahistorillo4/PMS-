import { isTripDepartureInPast } from "./tripSchedule";

describe("isTripDepartureInPast", () => {
  test("treats a same-day departure time that has passed as unavailable", () => {
    const now = new Date(2026, 10, 14, 16, 0);

    expect(
      isTripDepartureInPast({ date: "2026-11-14", departure: "15:59" }, now)
    ).toBe(true);
  });

  test("keeps a future same-day departure available", () => {
    const now = new Date(2026, 10, 14, 16, 0);

    expect(
      isTripDepartureInPast({ date: "2026-11-14", departure: "16:01" }, now)
    ).toBe(false);
  });

  test("treats a past trip date as unavailable even without a departure time", () => {
    const now = new Date(2026, 10, 14, 8, 0);

    expect(isTripDepartureInPast({ date: "2026-11-13" }, now)).toBe(true);
  });

  test("leaves today's trip visible when its departure time is unavailable", () => {
    const now = new Date(2026, 10, 14, 8, 0);

    expect(isTripDepartureInPast({ date: "2026-11-14" }, now)).toBe(false);
  });
});
