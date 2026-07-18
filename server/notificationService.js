const { dispatchEmailNotification, isMailConfigured } = require('./emailService');
const { dispatchSmsNotification, isSmsConfigured } = require('./smsService');
const { sanitizePayload } = require('./notificationPayload');

const ALLOWED_TYPES = new Set([
  'passenger_trip_cancellation',
  'passenger_booking_confirmation',
  'passenger_boarding_reminder',
  'passenger_payment_pending_reminder',
  'passenger_payment_expired',
  'passenger_refund_status',
  'admin_new_booking',
  'admin_refund_request',
  'admin_trip_alert',
  'admin_system_error',
]);

function isAnyChannelConfigured() {
  return isMailConfigured() || isSmsConfigured();
}

async function dispatchNotification({
  type,
  to,
  toPhone,
  adminEmails,
  adminPhones,
  payload = {},
  sendSms = true,
}) {
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`Unknown notification type: ${type}`);
  }

  const [emailResult, smsResult] = await Promise.allSettled([
    dispatchEmailNotification({ type, to, adminEmails, payload: sanitizePayload(payload) }),
    sendSms
      ? dispatchSmsNotification({ type, to: toPhone, adminPhones, payload: sanitizePayload(payload) })
      : Promise.resolve({ skipped: true, reason: 'sms_disabled' }),
  ]);

  return {
    email:
      emailResult.status === 'fulfilled'
        ? emailResult.value
        : { error: emailResult.reason?.message || String(emailResult.reason) },
    sms:
      smsResult.status === 'fulfilled'
        ? smsResult.value
        : { error: smsResult.reason?.message || String(smsResult.reason) },
  };
}

module.exports = {
  ALLOWED_TYPES,
  isAnyChannelConfigured,
  isMailConfigured,
  isSmsConfigured,
  dispatchNotification,
  dispatchEmailNotification,
  dispatchSmsNotification,
};
