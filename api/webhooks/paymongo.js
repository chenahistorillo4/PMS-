const { chargeSource } = require('../../server/paymongo');
const {
  markPaymentCompletedByIntentId,
  markPaymentFailedByIntentId,
  markPaymentCompletedBySourceId,
} = require('../../server/firebaseAdmin');
const {
  getPaymongoMode,
  readRawBody,
  verifyPaymongoSignature,
} = require('../../server/paymongoWebhookSignature');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      if (error.code === 'WEBHOOK_BODY_TOO_LARGE') {
        return res.status(413).json({ error: 'Webhook request body is too large' });
      }
      throw error;
    }

    const signature = req.headers['paymongo-signature'];
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    const mode = getPaymongoMode(process.env.PAYMONGO_SECRET_KEY);

    if (!webhookSecret || !mode || !rawBody?.length) {
      return res.status(503).json({ error: 'PayMongo webhook verification is not configured' });
    }

    if (!verifyPaymongoSignature({ header: signature, rawBody, secret: webhookSecret, mode })) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON webhook body' });
    }
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
