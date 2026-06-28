function pickBookingFields(booking = {}) {
  return {
    id: booking.id,
    referenceCode: booking.referenceCode,
    tripName: booking.tripName,
    boat: booking.boat,
    date: booking.date,
    departure: booking.departure,
    arrival: booking.arrival,
    customerName: booking.customerName,
    bookedByName: booking.bookedByName,
    finalPrice: booking.finalPrice,
    amount: booking.amount,
    status: booking.status,
    payment: booking.payment,
    userEmail: booking.userEmail,
    userPhone: booking.userPhone,
    userId: booking.userId,
  };
}

function sanitizePayload(payload = {}) {
  const next = { ...payload };
  if (next.booking) {
    next.booking = pickBookingFields(next.booking);
  }
  return next;
}

module.exports = {
  pickBookingFields,
  sanitizePayload,
};
