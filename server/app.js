require('./loadEnv');

const express = require('express');
const cors = require('cors');
const {
  createQrPhCheckout,
  getPaymentIntent,
  getQrPhImageFromIntent,
  refreshQrPhCheckout,
  chargeSource,
} = require('./paymongo');
const {
  initFirebaseAdmin,
  markPaymentCompletedByIntentId,
  markPaymentFailedByIntentId,
  markPaymentCompletedBySourceId,
} = require('./firebaseAdmin');
const { processPaymentExpiry } = require('./paymentExpiryService');

function getAllowedOrigins() {
  const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  if (process.env.VERCEL_BRANCH_URL) {
    origins.push(`https://${process.env.VERCEL_BRANCH_URL}`);
  }

  if (process.env.APP_URL) {
    origins.push(process.env.APP_URL.replace(/\/$/, ''));
  }

  return [...new Set(origins)];
}

function isLocalDevOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true;
    }
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  } catch {
    return false;
  }
}

function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        if (process.env.NODE_ENV !== 'production' && isLocalDevOrigin(origin)) {
          callback(null, true);
          return;
        }
        console.warn('CORS blocked origin:', origin);
        callback(new Error('Not allowed by CORS'));
      },
    })
  );

  app.post('/webhooks/paymongo', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
      const signature = req.get('Paymongo-Signature');
      const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;

      if (webhookSecret && signature !== webhookSecret) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      const event = JSON.parse(req.body.toString());
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
  });

  app.use(express.json());

  app.get('/health', (_req, res) => {
    const { isMailConfigured } = require('./emailService');
    const { isSmsConfigured } = require('./smsService');
    res.json({
      ok: true,
      paymongoConfigured: Boolean(process.env.PAYMONGO_SECRET_KEY),
      mailConfigured: isMailConfigured(),
      smsConfigured: isSmsConfigured(),
    });
  });

  app.get('/api/payments/qrph', async (req, res) => {
    const { paymentId } = req.query;
    if (typeof paymentId !== 'string' || !paymentId.trim()) {
      return res.status(400).json({ error: 'paymentId is required' });
    }

    try {
      const adminApp = initFirebaseAdmin();
      const result = await processPaymentExpiry(adminApp.firestore(), {
        paymentId: paymentId.trim(),
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      console.error('QR Ph payment expiry check error:', error);
      return res.status(500).json({ error: 'Unable to check payment expiry' });
    }
  });

  app.post('/api/payments/qrph', async (req, res) => {
    try {
      const { paymentId, amount, bookingId } = req.body;

      if (!paymentId || !amount) {
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

      return res.json(checkout);
    } catch (error) {
      console.error('QR Ph checkout error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/payments/gcash', async (req, res) => {
    try {
      const { paymentId, amount, bookingId } = req.body;

      if (!paymentId || !amount) {
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

      return res.json(checkout);
    } catch (error) {
      console.error('GCash/QR Ph checkout error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/payments/source/:sourceId/complete', async (req, res) => {
    try {
      const result = await chargeSource(req.params.sourceId);

      if (result.status === 'paid') {
        try {
          await markPaymentCompletedBySourceId(req.params.sourceId);
        } catch (firestoreError) {
          console.warn('Firestore update skipped:', firestoreError.message);
        }
      }

      return res.json(result);
    } catch (error) {
      console.error('Source complete error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/payments/status/:paymentIntentId', async (req, res) => {
    try {
      const paymentIntent = await getPaymentIntent(req.params.paymentIntentId);
      return res.json({
        status: paymentIntent.attributes.status,
        payments: paymentIntent.attributes.payments || [],
      });
    } catch (error) {
      console.error('Payment status error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/payments/qrph/:paymentIntentId/image', async (req, res) => {
    try {
      const qrImage = await getQrPhImageFromIntent(req.params.paymentIntentId);
      res.set('Content-Type', qrImage.mimeType);
      res.set('Cache-Control', 'no-store');
      return res.send(qrImage.buffer);
    } catch (error) {
      console.error('QR Ph image error:', error);
      return res.status(404).json({ error: error.message });
    }
  });

  app.post('/api/payments/qrph/:paymentIntentId/refresh', async (req, res) => {
    try {
      const checkout = await refreshQrPhCheckout(req.params.paymentIntentId);
      return res.json(checkout);
    } catch (error) {
      console.error('QR Ph refresh error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/notifications/email', async (req, res) => {
    const handler = require('./notificationRoute');
    return handler(req, res);
  });

  app.post('/api/notifications/send', async (req, res) => {
    const handler = require('./notificationRoute');
    return handler(req, res);
  });

  app.get('/api/notifications/status', (_req, res) => {
    const { isMailConfigured } = require('./emailService');
    const { isSmsConfigured } = require('./smsService');
    res.json({
      ok: true,
      mailConfigured: isMailConfigured(),
      smsConfigured: isSmsConfigured(),
      hasTextBeeKey: Boolean(process.env.TEXTBEE_API_KEY),
      textBeeDeviceId: process.env.TEXTBEE_DEVICE_ID || null,
    });
  });

  return app;
}

module.exports = { createApp };
