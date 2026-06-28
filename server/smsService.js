const APP_URL = process.env.APP_URL || 'https://ferry-app-minsu.vercel.app';
const SEMAPHORE_API_URL = 'https://api.semaphore.co/api/v4/messages';

function getSmsBrandName() {
  return (
    process.env.SMS_BRAND_NAME ||
    process.env.GMAIL_FROM_NAME ||
    'PMS Ferry'
  ).trim();
}

function isSmsConfigured() {
  return Boolean(process.env.SEMAPHORE_API_KEY);
}

function normalizePhone(phone) {
  if (!phone) return null;

  const digits = String(phone).trim().replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('63') && digits.length >= 12) {
    return digits;
  }

  if (digits.startsWith('0') && digits.length === 11) {
    return `63${digits.slice(1)}`;
  }

  if (digits.length === 10) {
    return `63${digits}`;
  }

  if (digits.startsWith('63')) {
    return digits;
  }

  return digits;
}

function formatSemaphoreNumber(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  return normalized.startsWith('63') ? normalized : `63${normalized}`;
}

async function sendSms({ to, text }) {
  if (!isSmsConfigured()) {
    return { skipped: true, reason: 'sms_not_configured' };
  }

  const recipients = (Array.isArray(to) ? to : [to])
    .map(formatSemaphoreNumber)
    .filter(Boolean);

  if (recipients.length === 0) {
    return { skipped: true, reason: 'missing_recipient' };
  }

  const message = String(text).trim();
  if (!message) {
    return { skipped: true, reason: 'missing_message' };
  }

  if (/^test\b/i.test(message)) {
    return { skipped: true, reason: 'message_starts_with_test' };
  }

  const params = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY,
    number: recipients.join(','),
    message: message.slice(0, 2048),
  });

  // Use registered sender ID. Defaults to DentalPal for this Semaphore account.
  const senderName = (process.env.SEMAPHORE_SENDER_NAME || 'DentalPal').trim();
  if (senderName) {
    params.set('sendername', senderName);
  }

  const response = await fetch(SEMAPHORE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const responseText = await response.text();
  let data;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    const errorMessage =
      typeof data === 'object' && data !== null
        ? data.message || data.error || JSON.stringify(data)
        : responseText || `Semaphore SMS failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const messages = Array.isArray(data) ? data : data ? [data] : [];
  const failed = messages.filter((entry) => String(entry?.status || '').toLowerCase() === 'failed');

  if (failed.length > 0) {
    throw new Error(
      failed.map((entry) => `${entry.recipient || 'unknown'}: ${entry.message || 'Failed'}`).join('; ')
    );
  }

  if (messages.length === 0) {
    throw new Error(`Unexpected Semaphore response: ${responseText || 'empty response'}`);
  }

  return {
    sent: true,
    to: recipients,
    response: messages,
  };
}

function getDefaultAdminPhones(extra = []) {
  const configured = (process.env.ADMIN_NOTIFICATION_PHONES || '')
    .split(',')
    .map((phone) => formatSemaphoreNumber(phone.trim()))
    .filter(Boolean);

  const normalizedExtra = extra.map(formatSemaphoreNumber).filter(Boolean);
  return [...new Set([...configured, ...normalizedExtra])];
}

function tripLine(details = {}) {
  const parts = [details.name, details.date, details.departure].filter(Boolean);
  return parts.join(' | ');
}

function buildSmsText(type, payload = {}) {
  const brand = getSmsBrandName();
  const booking = payload.booking || {};
  const refund = payload.refund || {};
  const tripDetails = payload.tripDetails || {};
  const customerName = payload.customerName || booking.customerName || 'Passenger';

  switch (type) {
    case 'passenger_trip_cancellation':
      return `${brand}: Hi ${customerName}, your trip ${tripLine(tripDetails)} was cancelled due to heavy rain or unsafe conditions. Open Notifications in the app to request a refund or reschedule. ${APP_URL}/notifications`;

    case 'passenger_booking_confirmation':
      return `${brand}: Booking confirmed. Ref: ${booking.referenceCode || 'N/A'}. Trip: ${booking.tripName || 'Ferry'} on ${booking.date || ''} at ${booking.departure || ''}. View booking: ${APP_URL}/manage`;

    case 'passenger_boarding_reminder':
      return `${brand}: Reminder - your ferry trip is tomorrow. Ref: ${booking.referenceCode || 'N/A'}. ${booking.tripName || 'Trip'} on ${booking.date || ''} at ${booking.departure || ''}. Arrive early with your QR pass. ${APP_URL}/manage`;

    case 'admin_new_booking':
      return `${brand} Admin: New booking from ${booking.customerName || 'passenger'}. Ref ${booking.referenceCode || 'N/A'}. Trip ${booking.tripName || ''} on ${booking.date || ''}. Amount PHP ${Number(booking.finalPrice || 0).toFixed(2)}.`;

    case 'admin_refund_request':
      return `${brand} Admin: Refund request from ${refund.userEmail || 'passenger'} for ${refund.tripName || 'trip'}. Amount PHP ${Number(refund.amount || 0).toFixed(2)}. Reason: ${refund.reason || 'Trip cancelled'}.`;

    case 'admin_trip_alert':
      return `${brand} Admin: ${payload.title || 'Trip alert'}. ${payload.message || ''} ${tripLine(tripDetails)}`;

    case 'admin_system_error':
      return `${brand} Admin: System error${payload.context ? ` (${payload.context})` : ''}. ${payload.errorMessage || 'Unknown error'}`;

    default:
      throw new Error(`Unknown SMS notification type: ${type}`);
  }
}

async function dispatchSmsNotification({ type, to, adminPhones, payload = {} }) {
  if (!isSmsConfigured()) {
    return { skipped: true, reason: 'sms_not_configured' };
  }

  const text = buildSmsText(type, payload);
  const isAdminType = type.startsWith('admin_');
  const recipients = isAdminType
    ? getDefaultAdminPhones(adminPhones)
    : [to].map(formatSemaphoreNumber).filter(Boolean);

  if (recipients.length === 0) {
    return { skipped: true, reason: 'missing_recipient' };
  }

  return sendSms({ to: recipients, text });
}

module.exports = {
  isSmsConfigured,
  normalizePhone,
  sendSms,
  dispatchSmsNotification,
  getDefaultAdminPhones,
};
