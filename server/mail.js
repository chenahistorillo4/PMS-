let nodemailer = null;

try {
  nodemailer = require('nodemailer');
} catch (error) {
  console.warn('nodemailer is not installed; email notifications are disabled.');
}

let transporter = null;

function isMailConfigured() {
  return Boolean(
    nodemailer && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
  );
}

function getTransporter() {
  if (!isMailConfigured()) {
    throw new Error('Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.');
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }

  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (!to) {
    return { skipped: true, reason: 'missing_recipient' };
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) {
    return { skipped: true, reason: 'missing_recipient' };
  }

  const transport = getTransporter();
  const fromName = process.env.GMAIL_FROM_NAME || 'PMS Port';

  const info = await transport.sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: recipients.join(', '),
    subject,
    text,
    html,
  });

  return { sent: true, messageId: info.messageId, to: recipients };
}

module.exports = {
  isMailConfigured,
  sendMail,
};
