function parsePromoDate(value) {
  if (!value) return null;

  let date;
  if (typeof value?.toDate === "function") {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = new Date(value.getTime());
  } else {
    const dateText = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;

    const [year, month, day] = dateText.split("-").map(Number);
    date = new Date(year, month - 1, day, 12);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
  }

  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

function isPromoWithinDateRange(promo, referenceDate = new Date()) {
  const start = parsePromoDate(promo?.startDate);
  const end = parsePromoDate(promo?.endDate);
  if ((promo?.startDate && !start) || (promo?.endDate && !end)) return false;

  const current = new Date(referenceDate);
  if (Number.isNaN(current.getTime())) return false;
  current.setHours(12, 0, 0, 0);

  if (start) start.setHours(0, 0, 0, 0);
  if (end) end.setHours(23, 59, 59, 999);

  return (!start || current >= start) && (!end || current <= end);
}

export function getPromoReservationCounts(bookings = []) {
  return bookings.reduce((counts, booking) => {
    if (["cancelled", "failed"].includes(String(booking?.status || "").toLowerCase())) {
      return counts;
    }

    const keys = [
      booking?.promoId,
      booking?.promoName ? `name:${booking.promoName}` : null,
    ].filter(Boolean);
    keys.forEach((key) => {
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, {});
}

export function isPromoExpired(promo, currentDate = new Date()) {
  if (!promo?.endDate) return false;

  const end = parsePromoDate(promo.endDate);
  const current = new Date(currentDate);
  if (!end || Number.isNaN(current.getTime())) return false;

  end.setHours(23, 59, 59, 999);
  current.setHours(12, 0, 0, 0);
  return current > end;
}

export function getActivePromo(promos = [], reservationCounts = {}, currentDate = new Date()) {
  if (!Array.isArray(promos) || promos.length === 0) return null;

  return promos
    .filter((promo) => {
      const percentage = Number(promo?.percentage);
      if (!promo?.active || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        return false;
      }

      if (!isPromoWithinDateRange(promo, currentDate)) return false;

      if (promo.availability === "limited") {
        const maximum = Number(promo.maxReservations);
        const reserved = Number(
          reservationCounts[promo.id] || reservationCounts[`name:${promo.name}`] || 0
        );
        if (!Number.isInteger(maximum) || maximum <= 0 || reserved >= maximum) return false;
      }

      return true;
    })
    .sort((first, second) => {
      const percentageDifference = Number(second.percentage) - Number(first.percentage);
      if (percentageDifference !== 0) return percentageDifference;
      return String(first.startDate || "").localeCompare(String(second.startDate || ""));
    })[0] || null;
}

export function calculatePromoDiscount(amount, promo) {
  const subtotal = Number(amount);
  const percentage = Number(promo?.percentage);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return 0;

  return Math.max(0, subtotal * (percentage / 100));
}
