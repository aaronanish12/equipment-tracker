const fetch = global.fetch || require('node-fetch');

const WA_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const API_VERSION = 'v20.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`;

async function sendText(toPhone, body) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'text',
      text: { body },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('WhatsApp send error:', JSON.stringify(data));
  }
  return data;
}

// Sends the pre-approved evening reminder template.
// You must create this exact template in Meta Business Manager first (see README).
// Template name: 'daily_equipment_check', one variable: engineer's name.
async function sendDailyCheckTemplate(toPhone, engineerName) {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toPhone,
      type: 'template',
      template: {
        name: 'daily_equipment_check',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: engineerName }],
          },
        ],
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('WhatsApp template send error:', JSON.stringify(data));
  }
  return data;
}

module.exports = { sendText, sendDailyCheckTemplate };
