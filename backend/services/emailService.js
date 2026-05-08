const nodemailer = require('nodemailer');
const { buildPasswordResetTemplate } = require('./emailTemplates');

const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS.');
  }

  return nodemailer.createTransport({
    host,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user, pass },
  });
}

async function sendEmail({ to, subject, html, text }) {
  const fromName = process.env.SMTP_FROM_NAME || 'Attendance Management';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `\"${fromName}\" <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  });
}

async function sendPasswordResetCodeEmail({ to, firstName, code, expiresMinutes }) {
  const tpl = buildPasswordResetTemplate({ firstName, code, expiresMinutes });
  await sendEmail({
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

module.exports = {
  sendEmail,
  sendPasswordResetCodeEmail,
};
