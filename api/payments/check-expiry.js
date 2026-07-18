require('../../server/loadEnv');

const { initFirebaseAdmin } = require('../../server/firebaseAdmin');
const { processPaymentExpiry } = require('../../server/paymentExpiryService');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return res.status(503).json({
      error: 'Payment expiry check requires FIREBASE_SERVICE_ACCOUNT_JSON on the server',
    });
  }

  try {
    const paymentId = req.query.paymentId || req.body?.paymentId || null;
    const app = initFirebaseAdmin();
    const db = app.firestore();
    const result = await processPaymentExpiry(db, { paymentId: paymentId || undefined });

    return res.status(200).json({
      ok: true,
      remindersSent: result.reminders.length,
      cancelled: result.cancelled.length,
      reminders: result.reminders,
      cancelledBookings: result.cancelled,
    });
  } catch (error) {
    console.error('Payment expiry check error:', error);
    return res.status(500).json({ error: error.message });
  }
};
