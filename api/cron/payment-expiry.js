require('../../server/loadEnv');

const { initFirebaseAdmin } = require('../../server/firebaseAdmin');
const {
  dispatchNotification,
  isAnyChannelConfigured,
} = require('../../server/notificationService');

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

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return res.status(503).json({
      error: 'Payment expiry cron requires FIREBASE_SERVICE_ACCOUNT_JSON on the server',
    });
  }

  try {
    const app = initFirebaseAdmin();
    const db = app.firestore();
    const now = new Date();
    const snapshot = await db.collection('payments').where('status', '==', 'pending').get();

    const reminders = [];
    const cancelled = [];

    for (const paymentDoc of snapshot.docs) {
      const payment = paymentDoc.data();
      const expiresAt = toDate(payment.paymentExpiresAt);
      if (!expiresAt) continue;

      const bookingId = payment.bookingId;
      if (!bookingId) continue;

      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingSnap = await bookingRef.get();
      if (!bookingSnap.exists) continue;

      const booking = bookingSnap.data();
      if (booking.status === 'cancelled' || booking.status === 'confirmed') continue;

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

        cancelled.push({ paymentId: paymentDoc.id, bookingId });
        continue;
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

        reminders.push({ paymentId: paymentDoc.id, bookingId });
      }
    }

    return res.status(200).json({
      ok: true,
      remindersSent: reminders.length,
      cancelled: cancelled.length,
      reminders,
      cancelledBookings: cancelled,
    });
  } catch (error) {
    console.error('Payment expiry cron error:', error);

    if (isAnyChannelConfigured()) {
      try {
        await dispatchNotification({
          type: 'admin_system_error',
          payload: {
            context: 'payment-expiry cron',
            errorMessage: error.message,
          },
        });
      } catch (notifyError) {
        console.error('Failed to notify admin about cron error:', notifyError);
      }
    }

    return res.status(500).json({ error: error.message });
  }
};
