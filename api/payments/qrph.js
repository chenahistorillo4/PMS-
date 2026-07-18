require('../../server/loadEnv');

const { parseJsonBody } = require('../_lib/parseBody');
const { createQrPhCheckout } = require('../../server/paymongo');
const { initFirebaseAdmin } = require('../../server/firebaseAdmin');
const { processPaymentExpiry } = require('../../server/paymentExpiryService');

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query.paymentId) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      return res.status(503).json({
        error: 'Payment expiry check requires FIREBASE_SERVICE_ACCOUNT_JSON on the server',
      });
    }

    try {
      const app = initFirebaseAdmin();
      const db = app.firestore();
      const result = await processPaymentExpiry(db, {
        paymentId: req.query.paymentId,
      });

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
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentId, amount, bookingId } = parseJsonBody(req);

    if (!paymentId || amount === undefined || amount === null) {
      return res.status(400).json({
        error: 'paymentId and amount are required',
      });
    }

    const checkout = await createQrPhCheckout({
      amount,
      description: `PMS Port booking ${bookingId || paymentId}`,
      metadata: {
        paymentId,
        bookingId: bookingId || '',
      },
    });

    return res.status(200).json(checkout);
  } catch (error) {
    console.error('QR Ph checkout error:', error);
    return res.status(500).json({ error: error.message });
  }
};
