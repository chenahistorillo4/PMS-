import { isExpiredPayMongoQr } from "./paymentExpiryCheck";

describe("isExpiredPayMongoQr", () => {
  const now = new Date("2026-11-13T00:00:00.000Z").getTime();

  const payment = {
    status: "pending",
    paymentProvider: "paymongo",
    paymongoFlow: "qrph",
    paymongoStatus: "unpaid",
    paymentExpiresAt: new Date(now - 1000),
  };

  test("identifies an unpaid PayMongo QR payment that has expired", () => {
    expect(isExpiredPayMongoQr(payment, now)).toBe(true);
  });

  test.each([
    ["unexpired", { ...payment, paymentExpiresAt: new Date(now + 1000) }],
    ["paid", { ...payment, paymongoStatus: "paid" }],
    ["manual", { ...payment, paymentProvider: "manual" }],
    ["cancelled", { ...payment, status: "cancelled" }],
  ])("does not expire a %s payment", (_, candidate) => {
    expect(isExpiredPayMongoQr(candidate, now)).toBe(false);
  });
});
