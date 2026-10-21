export function getBookingCreatedAt(booking) {
  if (!booking?.createdAt) return null;
  if (typeof booking.createdAt.toDate === 'function') return booking.createdAt.toDate();
  if (booking.createdAt instanceof Date) return booking.createdAt;
  if (typeof booking.createdAt?.seconds === 'number') {
    return new Date(booking.createdAt.seconds * 1000);
  }
  const parsed = new Date(booking.createdAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getBookingTripDate(booking) {
  const raw = booking?.date || booking?.bookingDate;
  if (!raw) return null;
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (raw instanceof Date) return raw;
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getPeriodRange(period) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: 'Today' };
  }

  if (period === 'yesterday') {
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(start);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { start, end: yesterdayEnd, label: 'Yesterday' };
  }

  if (period === 'weekly') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: 'Weekly (last 7 days)' };
  }

  if (period === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return { start, end, label: 'Monthly (this month)' };
  }

  return null;
}

export function getWeekRange(weekOffset = 0) {
  const now = new Date();
  const start = new Date(now);
  const dayOfWeek = start.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysFromMonday + (weekOffset * 7));
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end, label: weekOffset === 0 ? 'This week' : 'Last week' };
}

export function bookingMatchesPeriod(booking, range) {
  const createdAt = getBookingCreatedAt(booking);
  if (createdAt && createdAt >= range.start && createdAt <= range.end) {
    return true;
  }

  const tripDate = getBookingTripDate(booking);
  if (tripDate && tripDate >= range.start && tripDate <= range.end) {
    return true;
  }

  return false;
}

export function filterBookingsByPeriod(bookings, period) {
  const range = getPeriodRange(period);
  if (!range) return bookings;
  return bookings.filter((booking) => bookingMatchesPeriod(booking, range));
}

export function filterBookingsByRange(bookings, range) {
  return bookings.filter((booking) => bookingMatchesPeriod(booking, range));
}

export function getBookingRouteLabel(booking) {
  return booking.routeDirection || booking.route || 'N/A';
}

export function getBookingTripNameLabel(booking) {
  return booking.tripName || 'N/A';
}

export function normalizeBookingForReport(booking) {
  const amount = Number(booking.finalPrice ?? booking.paymentAmount ?? booking.amount ?? 0);
  const status = String(booking.status || 'pending').toLowerCase();
  const tripDate = getBookingTripDate(booking);

  return {
    referenceNumber: booking.referenceCode || booking.referenceNumber || 'N/A',
    passengerName: booking.customerName || booking.passengerName || 'N/A',
    route: getBookingRouteLabel(booking),
    bookingDate: tripDate
      ? tripDate.toISOString().split('T')[0]
      : booking.date || booking.bookingDate || 'N/A',
    paymentAmount: amount,
    status,
    ticketType: booking.bookingType || booking.ticketType || 'N/A',
    contactNumber: booking.userPhone || booking.contactNumber || 'N/A',
    boat: booking.boat || 'N/A',
    createdAt: getBookingCreatedAt(booking)?.toISOString() || null,
  };
}

export function summarizeBookings(bookings) {
  const normalized = bookings.map(normalizeBookingForReport);
  const totalRevenue = normalized.reduce((sum, b) => sum + b.paymentAmount, 0);
  const completedBookings = normalized.filter(
    (b) => ['confirmed', 'completed', 'departed', 'scanned'].includes(b.status)
  ).length;
  const pendingBookings = normalized.filter((b) => b.status === 'pending').length;
  const cancelledBookings = normalized.filter((b) => b.status === 'cancelled').length;

  return {
    totalBookings: normalized.length,
    completedBookings,
    pendingBookings,
    cancelledBookings,
    totalRevenue,
    averageRevenuePerBooking:
      normalized.length > 0 ? (totalRevenue / normalized.length).toFixed(2) : '0.00',
    bookingsList: normalized,
  };
}

export function getUniqueRoutesFromBookings(bookings) {
  return [...new Set(bookings.map(getBookingRouteLabel).filter((route) => route && route !== 'N/A'))].sort();
}

export function getUniqueTripNamesFromBookings(bookings) {
  return [...new Set(bookings.map(getBookingTripNameLabel).filter((name) => name && name !== 'N/A'))].sort();
}

export function getBookingAmount(booking) {
  return Number(booking?.finalPrice ?? booking?.paymentAmount ?? booking?.amount ?? 0);
}

export function isConfirmedBooking(booking) {
  const status = String(booking?.status || 'pending').toLowerCase();
  return ['confirmed', 'completed', 'departed', 'scanned'].includes(status);
}

function bookingCreatedInRange(booking, range) {
  const createdAt = getBookingCreatedAt(booking);
  return createdAt && createdAt >= range.start && createdAt <= range.end;
}

export function computeDashboardMetrics(bookings = []) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const weekRange = getPeriodRange('weekly');
  const monthRange = getPeriodRange('monthly');
  const todayRange = { start: todayStart, end: todayEnd };

  const revenueBookings = bookings.filter(isConfirmedBooking);
  const sumAmount = (list) => list.reduce((total, booking) => total + getBookingAmount(booking), 0);

  const createdToday = revenueBookings.filter((booking) => bookingCreatedInRange(booking, todayRange));
  const createdThisWeek = revenueBookings.filter((booking) =>
    weekRange ? bookingCreatedInRange(booking, weekRange) : false
  );
  const createdThisMonth = revenueBookings.filter((booking) =>
    monthRange ? bookingCreatedInRange(booking, monthRange) : false
  );

  const tripsToday = bookings.filter((booking) => {
    const tripDate = getBookingTripDate(booking);
    return tripDate && tripDate >= todayStart && tripDate <= todayEnd;
  });

  return {
    revenueToday: sumAmount(createdToday),
    revenueWeek: sumAmount(createdThisWeek),
    revenueMonth: sumAmount(createdThisMonth),
    totalBookings: bookings.length,
    confirmedBookings: revenueBookings.length,
    passengersToday: tripsToday.length,
    activeTrips: new Set(tripsToday.map((booking) => booking.tripId).filter(Boolean)).size,
  };
}

export function buildReportFilterLabel({ reportPeriod, filterDate, filterRoute, filterTripName }) {
  const parts = [];
  if (reportPeriod) {
    parts.push(getPeriodRange(reportPeriod)?.label || reportPeriod);
  }
  if (filterDate) {
    parts.push(`Trip date: ${filterDate}`);
  }
  if (filterRoute) {
    parts.push(`Route: ${filterRoute}`);
  }
  if (filterTripName) {
    parts.push(`Trip name: ${filterTripName}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'All bookings';
}
