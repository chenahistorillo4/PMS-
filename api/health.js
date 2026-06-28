require('../server/loadEnv');
const { isMailConfigured } = require('../server/emailService');
const { isSmsConfigured } = require('../server/smsService');

module.exports = (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    paymongoConfigured: Boolean(process.env.PAYMONGO_SECRET_KEY),
    mailConfigured: isMailConfigured(),
    smsConfigured: isSmsConfigured(),
  });
};
