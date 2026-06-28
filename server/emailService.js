const { sendMail, isMailConfigured } = require('./mail');

const APP_NAME = 'PMS Ferry';
const APP_URL = process.env.APP_URL || 'https://ferry-app-minsu.vercel.app';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title, bodyHtml) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
      <div style="background: #1565c0; color: #fff; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">${escapeHtml(APP_NAME)}</h1>
        <p style="margin: 8px 0 0; opacity: 0.9;">${escapeHtml(title)}</p>
      </div>
      <div style="background: #ffffff; border: 1px solid #e0e0e0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        ${bodyHtml}
        <p style="margin-top: 24px; font-size: 12px; color: #777;">
          This is an automated message from ${escapeHtml(APP_NAME)}. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  `;
}

function tripDetailsBlock(details = {}) {
  const rows = [
    ['Trip', details.name],
    ['Boat', details.boat],
    ['Date', details.date],
    ['Departure', details.departure],
    ['Arrival', details.arrival],
  ].filter(([, value]) => value);

  if (rows.length === 0) return '';

  return `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding: 8px 0; color: #666; width: 120px;">${escapeHtml(label)}</td>
          <td style="padding: 8px 0; font-weight: 600;">${escapeHtml(value)}</td>
        </tr>`
        )
        .join('')}
    </table>
  `;
}

async function sendPassengerTripCancellation({ to, customerName, message, tripDetails, reason }) {
  const html = layout(
    'Trip Cancellation Notice',
    `
      <p>Hello ${escapeHtml(customerName || 'Passenger')},</p>
      <p>${escapeHtml(message || 'Your ferry trip has been cancelled.')}</p>
      ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
      ${tripDetailsBlock(tripDetails)}
      <p>You may request a <strong>refund</strong> or <strong>reschedule</strong> from your Notifications page in the app.</p>
      <p><a href="${APP_URL}/notifications" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open Notifications</a></p>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} – Trip Cancelled${tripDetails?.name ? `: ${tripDetails.name}` : ''}`,
    text: `${message || 'Your trip has been cancelled.'} Visit ${APP_URL}/notifications to request a refund or reschedule.`,
    html,
  });
}

async function sendPassengerBookingConfirmation({ to, customerName, booking }) {
  const html = layout(
    'Booking Confirmation',
    `
      <p>Hello ${escapeHtml(customerName || 'Passenger')},</p>
      <p>Your ferry booking is confirmed. Please save your reference code for boarding.</p>
      <p style="font-size: 18px;"><strong>Reference:</strong> ${escapeHtml(booking?.referenceCode || 'N/A')}</p>
      ${tripDetailsBlock({
        name: booking?.tripName,
        boat: booking?.boat,
        date: booking?.date,
        departure: booking?.departure,
        arrival: booking?.arrival,
      })}
      <p><strong>Amount paid:</strong> ₱${escapeHtml(Number(booking?.finalPrice || booking?.amount || 0).toFixed(2))}</p>
      <p><a href="${APP_URL}/manage" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">View My Booking</a></p>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} – Booking Confirmed (${booking?.referenceCode || 'Booking'})`,
    text: `Booking confirmed. Reference: ${booking?.referenceCode || 'N/A'}. View: ${APP_URL}/manage`,
    html,
  });
}

async function sendPassengerBoardingReminder({ to, customerName, booking }) {
  const html = layout(
    'Boarding Reminder',
    `
      <p>Hello ${escapeHtml(customerName || 'Passenger')},</p>
      <p>This is a reminder that your ferry trip is coming up soon. Please arrive at the port early with your QR boarding pass.</p>
      <p style="font-size: 18px;"><strong>Reference:</strong> ${escapeHtml(booking?.referenceCode || 'N/A')}</p>
      ${tripDetailsBlock({
        name: booking?.tripName,
        boat: booking?.boat,
        date: booking?.date,
        departure: booking?.departure,
        arrival: booking?.arrival,
      })}
      <p><a href="${APP_URL}/manage" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open Boarding Pass</a></p>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} – Boarding Reminder for ${booking?.date || 'your trip'}`,
    text: `Boarding reminder. Reference: ${booking?.referenceCode || 'N/A'}. Trip on ${booking?.date || 'soon'}.`,
    html,
  });
}

async function sendAdminNewBooking({ to, booking }) {
  const html = layout(
    'New Booking Alert',
    `
      <p>A new booking has been submitted on ${escapeHtml(APP_NAME)}.</p>
      <p><strong>Customer:</strong> ${escapeHtml(booking?.customerName || 'Unknown')}</p>
      <p><strong>Reference:</strong> ${escapeHtml(booking?.referenceCode || 'N/A')}</p>
      <p><strong>Payment:</strong> ${escapeHtml(booking?.payment || 'N/A')} — ${escapeHtml(booking?.status || 'pending')}</p>
      ${tripDetailsBlock({
        name: booking?.tripName,
        boat: booking?.boat,
        date: booking?.date,
        departure: booking?.departure,
        arrival: booking?.arrival,
      })}
      <p><strong>Amount:</strong> ₱${escapeHtml(Number(booking?.finalPrice || 0).toFixed(2))}</p>
      <p><a href="${APP_URL}/booking-management" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Review Booking</a></p>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} Admin – New Booking (${booking?.referenceCode || 'Alert'})`,
    text: `New booking from ${booking?.customerName || 'customer'}. Reference ${booking?.referenceCode || 'N/A'}.`,
    html,
  });
}

async function sendAdminRefundRequest({ to, refund }) {
  const html = layout(
    'Refund Request',
    `
      <p>A passenger submitted a refund request.</p>
      <p><strong>Passenger email:</strong> ${escapeHtml(refund?.userEmail || 'N/A')}</p>
      <p><strong>Trip:</strong> ${escapeHtml(refund?.tripName || 'N/A')}</p>
      <p><strong>Reason:</strong> ${escapeHtml(refund?.reason || 'Trip cancelled')}</p>
      <p><strong>Amount:</strong> ₱${escapeHtml(Number(refund?.amount || 0).toFixed(2))}</p>
      <p><a href="${APP_URL}/payment-management" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Review Refund</a></p>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} Admin – Refund Request`,
    text: `Refund request from ${refund?.userEmail || 'passenger'} for ${refund?.tripName || 'trip'}.`,
    html,
  });
}

async function sendAdminTripAlert({ to, title, message, tripDetails }) {
  const html = layout(
    title || 'Trip Alert',
    `
      <p>${escapeHtml(message || 'A trip update requires admin attention.')}</p>
      ${tripDetailsBlock(tripDetails)}
      <p><a href="${APP_URL}/schedule-management" style="display:inline-block;background:#1565c0;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open Schedule</a></p>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} Admin – ${title || 'Trip Alert'}`,
    text: message || 'Trip alert',
    html,
  });
}

async function sendAdminSystemError({ to, errorMessage, context }) {
  const html = layout(
    'System Error Alert',
    `
      <p>A system error was reported on ${escapeHtml(APP_NAME)}.</p>
      ${context ? `<p><strong>Context:</strong> ${escapeHtml(context)}</p>` : ''}
      <pre style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;">${escapeHtml(errorMessage || 'Unknown error')}</pre>
    `
  );

  return sendMail({
    to,
    subject: `${APP_NAME} Admin – System Error`,
    text: `System error${context ? ` (${context})` : ''}: ${errorMessage || 'Unknown error'}`,
    html,
  });
}

function getDefaultAdminEmails(extra = []) {
  const configured = (process.env.ADMIN_NOTIFICATION_EMAILS || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean);

  const all = [...configured, ...extra].filter(Boolean);
  return [...new Set(all)];
}

async function dispatchEmailNotification({ type, to, adminEmails, payload = {} }) {
  if (!isMailConfigured()) {
    return { skipped: true, reason: 'mail_not_configured' };
  }

  const admins = getDefaultAdminEmails(adminEmails);

  switch (type) {
    case 'passenger_trip_cancellation':
      return sendPassengerTripCancellation({
        to,
        customerName: payload.customerName,
        message: payload.message,
        tripDetails: payload.tripDetails,
        reason: payload.reason,
      });

    case 'passenger_booking_confirmation':
      return sendPassengerBookingConfirmation({
        to,
        customerName: payload.customerName,
        booking: payload.booking,
      });

    case 'passenger_boarding_reminder':
      return sendPassengerBoardingReminder({
        to,
        customerName: payload.customerName,
        booking: payload.booking,
      });

    case 'admin_new_booking':
      return sendAdminNewBooking({ to: admins, booking: payload.booking });

    case 'admin_refund_request':
      return sendAdminRefundRequest({ to: admins, refund: payload.refund });

    case 'admin_trip_alert':
      return sendAdminTripAlert({
        to: admins,
        title: payload.title,
        message: payload.message,
        tripDetails: payload.tripDetails,
      });

    case 'admin_system_error':
      return sendAdminSystemError({
        to: admins,
        errorMessage: payload.errorMessage,
        context: payload.context,
      });

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

module.exports = {
  isMailConfigured,
  dispatchEmailNotification,
  getDefaultAdminEmails,
};
