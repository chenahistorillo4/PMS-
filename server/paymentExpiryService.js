const { dispatchNotification } = require('./notificationService');

const PAYMENT_NOTICE =
  'Please note: Your booking will only be confirmed once payment is received. QR codes are valid for 30 minutes. If payment is not completed within this time, your booking will be automatically cancelled.';

const APP_URL = process.env.APP_URL || 'https://ferry-app-minsu.vercel.app';

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function processPendingPaymentDoc(db, paymentDoc, now = new Date()) {
  const payment = paymentDoc.data();
  const expiresAt = toDate(payment.paymentExpiresAt);
  if (!expiresAt) {
    return { action: 'skipped' };
  }

  const bookingId = payment.bookingId;
  if (!bookingId) {
    return { action: 'skipped' };
  }

  const bookingRef = db.collection('bookings').doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    return { action: 'skipped' };
  }

  const booking = bookingSnap.data();
  if (booking.status === 'cancelled' || booking.status === 'confirmed') {
    return { action: 'skipped' };
  }

  if (now >= expiresAt) {
    await paymentDoc.ref.update({
      status: 'failed',
      autoCancelledAt: now,
      cancelReason: 'payment_expired',
    });
    await bookingRef.update({
      status: 'cancelled',
      autoCancelledAt: now,
      cancelReason: 'payment_expired',
    });

    if (!payment.paymentExpiredNotified) {
      await dispatchNotification({
        type: 'passenger_payment_expired',
        to: payment.userEmail || booking.userEmail,
        toPhone: payment.userPhone || booking.userPhone,
        payload: {
          customerName: payment.customerName || booking.customerName,
          booking: {
            referenceCode: booking.referenceCode,
            tripName: booking.tripName,
            boat: booking.boat,
            date: booking.date,
            departure: booking.departure,
            arrival: booking.arrival,
            finalPrice: booking.finalPrice || payment.amount,
          },
        },
      });

      await paymentDoc.ref.update({
        paymentExpiredNotified: true,
        paymentExpiredNotifiedAt: now,
      });
    }

    return { action: 'cancelled', paymentId: paymentDoc.id, bookingId };
  }

  const reminderAt = new Date(expiresAt.getTime() - 15 * 60 * 1000);
  if (now >= reminderAt && !payment.paymentReminderSent) {
    const paymentUrl = `${APP_URL}/payment-qr?paymentId=${paymentDoc.id}`;

    await dispatchNotification({
      type: 'passenger_payment_pending_reminder',
      to: payment.userEmail || booking.userEmail,
      toPhone: payment.userPhone || booking.userPhone,
      payload: {
        customerName: payment.customerName || booking.customerName,
        message: PAYMENT_NOTICE,
        paymentUrl,
        booking: {
          referenceCode: booking.referenceCode,
          tripName: booking.tripName,
          boat: booking.boat,
          date: booking.date,
          departure: booking.departure,
          arrival: booking.arrival,
          finalPrice: booking.finalPrice || payment.amount,
          amount: payment.amount,
        },
      },
    });

    await paymentDoc.ref.update({
      paymentReminderSent: true,
      paymentReminderSentAt: now,
    });

    return { action: 'reminder', paymentId: paymentDoc.id, bookingId };
  }

  return { action: 'pending', paymentId: paymentDoc.id, bookingId };
}

async function processPaymentExpiry(db, { paymentId } = {}) {
  const now = new Date();
  const reminders = [];
  const cancelled = [];

  if (paymentId) {
    const paymentDoc = await db.collection('payments').doc(paymentId).get();
    if (!paymentDoc.exists || paymentDoc.data()?.status !== 'pending') {
      return { reminders, cancelled, processed: 0 };
    }

    const result = await processPendingPaymentDoc(db, paymentDoc, now);
    if (result.action === 'reminder') reminders.push({ paymentId: result.paymentId, bookingId: result.bookingId });
    if (result.action === 'cancelled') cancelled.push({ paymentId: result.paymentId, bookingId: result.bookingId });

    return { reminders, cancelled, processed: 1 };
  }

  const snapshot = await db.collection('payments').where('status', '==', 'pending').get();

  for (const paymentDoc of snapshot.docs) {
    const result = await processPendingPaymentDoc(db, paymentDoc, now);
    if (result.action === 'reminder') reminders.push({ paymentId: result.paymentId, bookingId: result.bookingId });
    if (result.action === 'cancelled') cancelled.push({ paymentId: result.paymentId, bookingId: result.bookingId });
  }

  return { reminders, cancelled, processed: snapshot.size };
}

module.exports = {
  processPaymentExpiry,
};
