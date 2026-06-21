const { parseJsonBody } = require('../_lib/parseBody');
const { chargeSource } = require('../../server/paymongo');
const {
  markPaymentCompletedByIntentId,
  markPaymentFailedByIntentId,
  markPaymentCompletedBySourceId,
} = require('../../server/firebaseAdmin');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const signature = req.headers['paymongo-signature'];
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

    if (webhookSecret && signature !== webhookSecret) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    const event = parseJsonBody(req);
    const eventType = event?.data?.attributes?.type;
    const resource = event?.data?.attributes?.data;

    if (eventType === 'source.chargeable') {
      const sourceId = resource?.id;
      if (sourceId) {
        await chargeSource(sourceId);
        await markPaymentCompletedBySourceId(sourceId);
      }
      return res.status(200).json({ received: true });
    }

    if (eventType === 'payment.paid') {
      const paymentIntentId =
        resource?.attributes?.payment_intent_id ||
        (resource?.type === 'payment_intent' ? resource?.id : null);

      if (paymentIntentId) {
        await markPaymentCompletedByIntentId(paymentIntentId);
      }
      return res.status(200).json({ received: true });
    }

    if (eventType === 'payment.failed') {
      const paymentIntentId = resource?.attributes?.payment_intent_id;
      if (paymentIntentId) {
        await markPaymentFailedByIntentId(paymentIntentId);
      }
      return res.status(200).json({ received: true });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('PayMongo webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
};
