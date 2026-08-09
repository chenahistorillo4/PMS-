const {
  dispatchNotification,
  isAnyChannelConfigured,
  ALLOWED_TYPES,
} = require('./notificationService');

module.exports = async (req, res) => {
  try {
    if (!isAnyChannelConfigured()) {
      return res.status(503).json({
        error: 'Notifications are not configured. Set Gmail and/or TextBee env vars.',
      });
    }

    const { type, to, toPhone, adminEmails, adminPhones, payload, sendSms } = req.body || {};

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

    return res.json({ ok: true, result });
  } catch (error) {
    console.error('Notification error:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error',
      hint:
        process.env.NODE_ENV !== 'production'
          ? 'Start the backend with npm run dev (not npm start alone).'
          : 'Check Vercel env vars: TEXTBEE_API_KEY (and optional TEXTBEE_DEVICE_ID).',
    });
  }
};
