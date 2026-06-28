require('../server/loadEnv');
const { isMailConfigured } = require('../server/emailService');
const { isSmsConfigured } = require('../server/smsService');

module.exports = (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    mailConfigured: isMailConfigured(),
    smsConfigured: isSmsConfigured(),
    hasSemaphoreKey: Boolean(process.env.SEMAPHORE_API_KEY),
    senderName: process.env.SEMAPHORE_SENDER_NAME || 'DentalPal',
  });
};
