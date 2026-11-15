const TERMINAL_BOOKING_STATUSES = new Set([
  "cancelled",
  "departed",
  "scanned",
  "boarded",
]);

export function getPassengerFareForTrip(booking, trip) {
  if (booking?.bookingType === "cargo_only") return 0;
  const fare = Number(trip?.price);
  return Number.isFinite(fare) && fare >= 0 ? fare : null;
}

export function canRescheduleAtSameFare(booking, trip) {
  if (!booking || !trip) return false;
  if (TERMINAL_BOOKING_STATUSES.has(String(booking.status || "").toLowerCase())) {
    return false;
  }

  const oldFare = Number(booking.passengerPrice ?? booking.basePrice ?? 0);
  const newFare = getPassengerFareForTrip(booking, trip);
  if (!Number.isFinite(oldFare) || oldFare < 0 || newFare === null) return false;
  return Math.round(oldFare * 100) === Math.round(newFare * 100);
}
