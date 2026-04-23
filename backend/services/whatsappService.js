/**
 * WhatsApp Service using whatsapp-web.js
 *
 * On first run the server prints a QR code in the terminal.
 * Scan it once with the WhatsApp account that is already in
 * the school's parent/teacher groups. After that the session
 * is stored in ./.wwebjs_auth and no further scanning is needed.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode                = require('qrcode-terminal');

let client;
let clientReady = false;

function init() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    console.log('\n📱  Scan this QR code with WhatsApp to connect:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    clientReady = true;
    console.log('WhatsApp client is ready ✅');
  });

  client.on('disconnected', (reason) => {
    clientReady = false;
    console.warn('WhatsApp disconnected:', reason);
    // Auto-reconnect after 10 s
    setTimeout(() => client.initialize(), 10_000);
  });

  client.initialize();
}

/**
 * Send a text message to a WhatsApp chat / group.
 * @param {string} jid   - WhatsApp Chat ID, e.g. "120363xxxxxxx@g.us" for groups
 * @param {string} text  - Message body
 */
async function sendMessage(jid, text) {
  if (!client || !clientReady) {
    throw new Error('WhatsApp client is not ready. Please wait or scan the QR code.');
  }
  await client.sendMessage(jid, text);
}

/**
 * Returns true if the WhatsApp client is authenticated and ready.
 */
function isReady() {
  return clientReady;
}

module.exports = { init, sendMessage, isReady };
