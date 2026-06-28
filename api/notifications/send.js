const { parseJsonBody } = require('../_lib/parseBody');
const {
  dispatchNotification,
  isAnyChannelConfigured,
  ALLOWED_TYPES,
} = require('../../server/notificationService');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!isAnyChannelConfigured()) {
      return res.status(503).json({
        error: 'Notifications are not configured. Set Gmail and/or Semaphore env vars.',
      });
    }

    const body = parseJsonBody(req);
    const { type, to, toPhone, adminEmails, adminPhones, payload, sendSms } = body;

    if (!type || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    const result = await dispatchNotification({
      type,
      to,
      toPhone,
      adminEmails,
      adminPhones,
      payload: payload || {},
      sendSms: sendSms !== false,
    });

    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('Notification error:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error',
      hint:
        process.env.NODE_ENV !== 'production'
          ? 'Start the backend with npm run dev (not npm start alone).'
          : 'Check Vercel env vars: SEMAPHORE_API_KEY, SEMAPHORE_SENDER_NAME.',
    });
  }
};
