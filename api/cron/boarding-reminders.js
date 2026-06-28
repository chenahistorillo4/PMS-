require('../../server/loadEnv');

const { initFirebaseAdmin } = require('../../server/firebaseAdmin');
const {
  dispatchNotification,
  isAnyChannelConfigured,
} = require('../../server/notificationService');

function getTomorrowDateString() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isAnyChannelConfigured()) {
    return res.status(503).json({ error: 'Email/SMS notifications are not configured' });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return res.status(503).json({
      error: 'Boarding reminders require FIREBASE_SERVICE_ACCOUNT_JSON on the server',
    });
  }

  try {
    const app = initFirebaseAdmin();
    const db = app.firestore();
    const targetDate = getTomorrowDateString();

    const snapshot = await db
      .collection('bookings')
      .where('date', '==', targetDate)
      .where('status', '==', 'confirmed')
      .get();

    const results = [];

    for (const bookingDoc of snapshot.docs) {
      const booking = bookingDoc.data();
      if (booking.boardingReminderSent) {
        continue;
      }

      const email = booking.userEmail;
      const phone = booking.userPhone;
      if (!email && !phone) {
        continue;
      }

      await dispatchNotification({
        type: 'passenger_boarding_reminder',
        to: email,
        toPhone: phone,
        payload: {
          customerName: booking.customerName || booking.bookedByName,
          booking: {
            referenceCode: booking.referenceCode,
            tripName: booking.tripName,
            boat: booking.boat,
            date: booking.date,
            departure: booking.departure,
            arrival: booking.arrival,
          },
        },
      });

      await bookingDoc.ref.update({
        boardingReminderSent: true,
        boardingReminderSentAt: new Date(),
      });

      results.push({ bookingId: bookingDoc.id, email, phone });
    }

    return res.status(200).json({
      ok: true,
      targetDate,
      sent: results.length,
      results,
    });
  } catch (error) {
    console.error('Boarding reminder cron error:', error);

    try {
      await dispatchNotification({
        type: 'admin_system_error',
        payload: {
          context: 'boarding-reminders cron',
          errorMessage: error.message,
        },
      });
    } catch (notifyError) {
      console.error('Failed to notify admin about cron error:', notifyError);
    }

    return res.status(500).json({ error: error.message });
  }
};
