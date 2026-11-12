function parsePromoDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;

  const dateText = String(value).slice(0, 10);
  const parsed = new Date(`${dateText}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPromoWithinDateRange(promo, referenceDate = new Date()) {
  const start = parsePromoDate(promo?.startDate);
  const end = parsePromoDate(promo?.endDate);
  if (!start || !end) return false;

  const current = new Date(referenceDate);
  current.setHours(12, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return current >= start && current <= end;
}

function isPromoAvailable(promo, promoReservationCounts = {}) {
  if (!promo?.active) return false;
  if (!isPromoWithinDateRange(promo)) return false;

  if (promo.availability === 'limited') {
    const maxReservations = Number(promo.maxReservations);
    const usedReservations = Number(promoReservationCounts[promo.id] || 0);
    if (!Number.isInteger(maxReservations) || maxReservations <= 0) return false;
    if (usedReservations >= maxReservations) return false;
  }

  return true;
}

export function getPromoReservationCounts(bookings = []) {
  const counts = {};

  bookings.forEach((booking) => {
    const promoId = booking?.promoId;
    if (!promoId) return;

    const status = String(booking.status || '').toLowerCase();
    if (['cancelled', 'failed'].includes(status)) return;

    counts[promoId] = (counts[promoId] || 0) + 1;
  });

  return counts;
}

export function getActivePromo(promos = [], promoReservationCounts = {}) {
  if (!Array.isArray(promos) || promos.length === 0) return null;

  const availablePromos = promos
    .filter((promo) => isPromoAvailable(promo, promoReservationCounts))
    .sort((first, second) => {
      const percentageDiff = Number(second.percentage) - Number(first.percentage);
      if (percentageDiff !== 0) return percentageDiff;
      return String(first.startDate || '').localeCompare(String(second.startDate || ''));
    });

  return availablePromos[0] || null;
}

export function calculatePromoDiscount(amountAfterPassengerDiscount, activePromo) {
  const subtotal = Number(amountAfterPassengerDiscount);
  if (!activePromo || !Number.isFinite(subtotal) || subtotal <= 0) return 0;

  const percentage = Number(activePromo.percentage);
  if (!Number.isFinite(percentage) || percentage <= 0) return 0;

  return Math.max(0, subtotal * (percentage / 100));
}
