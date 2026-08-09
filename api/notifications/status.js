require('../server/loadEnv');
const { isMailConfigured } = require('../server/emailService');
const { isSmsConfigured } = require('../server/smsService');

module.exports = (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    mailConfigured: isMailConfigured(),
    smsConfigured: isSmsConfigured(),
    hasTextBeeKey: Boolean(process.env.TEXTBEE_API_KEY),
    textBeeDeviceId: process.env.TEXTBEE_DEVICE_ID || null,
  });
};
