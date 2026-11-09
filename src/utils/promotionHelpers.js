export function getPromoReservationCounts(bookings = []) {
  return bookings.reduce((counts, booking) => {
    if (["cancelled", "failed"].includes(String(booking?.status || "").toLowerCase())) {
      return counts;
    }

    const keys = [booking?.promoId, booking?.promoName ? `name:${booking.promoName}` : null].filter(Boolean);
    keys.forEach((key) => {
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, {});
}

export function getActivePromo(promos = [], reservationCounts = {}, currentDate = new Date()) {
  const today = [
    currentDate.getFullYear(),
    String(currentDate.getMonth() + 1).padStart(2, "0"),
    String(currentDate.getDate()).padStart(2, "0"),
  ].join("-");

  return promos
    .filter((promo) => {
      const percentage = Number(promo?.percentage);
      if (!promo?.active || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) {
        return false;
      }

      if ((promo.startDate && today < promo.startDate) || (promo.endDate && today > promo.endDate)) {
        return false;
      }

      if (promo.availability === "limited") {
        const maximum = Number(promo.maxReservations);
        const reserved = Number(
          reservationCounts[promo.id] || reservationCounts[`name:${promo.name}`] || 0
        );
        if (!Number.isInteger(maximum) || maximum <= 0 || reserved >= maximum) return false;
      }

      return true;
    })
    .sort((first, second) => Number(second.percentage) - Number(first.percentage))[0] || null;
}

export function calculatePromoDiscount(amount, promo) {
  const percentage = Number(promo?.percentage);
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100) return 0;
  return Math.max(0, Number(amount) || 0) * (percentage / 100);
}
