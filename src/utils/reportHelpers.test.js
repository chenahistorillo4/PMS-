import {
  attachPaymentStatuses,
  isReportableBooking,
  summarizeBookings,
} from './reportHelpers';

describe('report booking scan eligibility', () => {
  test('includes a PayMongo-paid booking only after passenger QR scan', () => {
    const [booking] = attachPaymentStatuses(
      [{ id: 'booking-1', status: 'scanned', amount: 500 }],
      [{ bookingId: 'booking-1', status: 'pending', paymongoStatus: 'paid' }]
    );

    expect(isReportableBooking(booking)).toBe(true);
    expect(summarizeBookings([booking])).toMatchObject({
      totalBookings: 1,
      totalRevenue: 500,
    });

    const [unscannedBooking] = attachPaymentStatuses(
      [{ id: 'booking-2', status: 'confirmed', amount: 500 }],
      [{ bookingId: 'booking-2', status: 'pending', paymongoStatus: 'paid' }]
    );
    expect(isReportableBooking(unscannedBooking)).toBe(false);
  });

  test('requires a completed payment and excludes unpaid or cancelled bookings', () => {
    expect(isReportableBooking({ status: 'scanned', paymentStatus: 'completed' })).toBe(true);
    expect(isReportableBooking({ status: 'boarded', paymentStatus: 'completed' })).toBe(true);
    expect(isReportableBooking({ status: 'scanned', paymentStatus: 'pending' })).toBe(false);
    expect(isReportableBooking({ status: 'boarded', paymentStatus: 'pending' })).toBe(false);
    expect(isReportableBooking({
      status: 'cancelled',
      paymentStatus: 'completed',
    })).toBe(false);
  });

  test('prefers a completed payment over a pending payment for the same booking', () => {
    const [booking] = attachPaymentStatuses(
      [{ id: 'booking-1', status: 'pending' }],
      [
        { bookingId: 'booking-1', status: 'pending' },
        { bookingId: 'booking-1', status: 'completed' },
      ]
    );

    expect(booking.paymentStatus).toBe('completed');
    expect(isReportableBooking(booking)).toBe(false);
    expect(isReportableBooking({ ...booking, status: 'scanned' })).toBe(true);
  });
});
