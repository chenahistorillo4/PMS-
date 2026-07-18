require('../../server/loadEnv');

const { initFirebaseAdmin } = require('../../server/firebaseAdmin');
const { processPaymentExpiry } = require('../../server/paymentExpiryService');
const {
  dispatchNotification,
  isAnyChannelConfigured,
} = require('../../server/notificationService');

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
    const result = await processPaymentExpiry(db);

    return res.status(200).json({
      ok: true,
      remindersSent: result.reminders.length,
      cancelled: result.cancelled.length,
      reminders: result.reminders,
      cancelledBookings: result.cancelled,
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
