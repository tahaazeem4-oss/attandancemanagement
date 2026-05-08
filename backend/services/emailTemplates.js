function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPasswordResetTemplate({ firstName, code, expiresMinutes }) {
  const safeName = escapeHtml(firstName || 'there');
  const safeCode = escapeHtml(code);

  const html = `
  <div style="background:#f8fafc;padding:24px;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#1d4ed8;color:#ffffff;padding:16px 20px;font-size:18px;font-weight:700;">
        Attendance Management - Password Reset
      </div>
      <div style="padding:20px;line-height:1.6;">
        <p style="margin:0 0 12px;">Hi ${safeName},</p>
        <p style="margin:0 0 12px;">We received a request to reset your password.</p>
        <p style="margin:0 0 8px;">Use this verification code:</p>
        <div style="font-size:30px;letter-spacing:6px;font-weight:800;color:#1d4ed8;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;display:inline-block;">
          ${safeCode}
        </div>
        <p style="margin:16px 0 0;">This code expires in ${expiresMinutes} minutes.</p>
        <p style="margin:12px 0 0;color:#475569;">If you did not request this reset, you can safely ignore this email.</p>
      </div>
    </div>
  </div>`;

  const text = [
    `Hi ${firstName || 'there'},`,
    '',
    'We received a request to reset your password.',
    `Your verification code is: ${code}`,
    `This code expires in ${expiresMinutes} minutes.`,
    '',
    'If you did not request this reset, you can ignore this email.',
  ].join('\n');

  return {
    subject: 'Your Password Reset Code',
    html,
    text,
  };
}

module.exports = {
  buildPasswordResetTemplate,
};
