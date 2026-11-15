import {
  attachPaymentStatuses,
  getPeriodRange,
  isGcashBooking,
  isReportableBooking,
  isPayLaterBooking,
  summarizeBookings,
} from './reportHelpers';

describe('booking payment method classification', () => {
  test('classifies GCash and PayLater bookings separately', () => {
    expect(isGcashBooking({ payment: 'gcash', paymentMode: 'prepaid' })).toBe(true);
    expect(isPayLaterBooking({ payment: 'Pay Later', paymentMode: 'pay_later' })).toBe(true);
    expect(isGcashBooking({ payment: 'Pay Later', paymentMode: 'pay_later' })).toBe(false);
    expect(isPayLaterBooking({ payment: 'gcash', paymentMode: 'prepaid' })).toBe(false);
  });
});

describe('report date ranges', () => {
  test('last month range includes the complete previous calendar month', () => {
    const now = new Date();
    const range = getPeriodRange('lastMonth');
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    expect(range.label).toBe('Last month');
    expect(range.start.getFullYear()).toBe(previousMonth.getFullYear());
    expect(range.start.getMonth()).toBe(previousMonth.getMonth());
    expect(range.start.getDate()).toBe(1);
    expect(range.end.getFullYear()).toBe(lastDayOfPreviousMonth.getFullYear());
    expect(range.end.getMonth()).toBe(lastDayOfPreviousMonth.getMonth());
    expect(range.end.getDate()).toBe(lastDayOfPreviousMonth.getDate());
    expect(range.end.getHours()).toBe(23);
    expect(range.end.getMilliseconds()).toBe(999);
  });
});

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
