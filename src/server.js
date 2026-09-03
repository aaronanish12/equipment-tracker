require('dotenv').config();
const express = require('express');
const { handleMessage } = require('./commands');
const { sendText } = require('./whatsapp');
const { startScheduler } = require('./scheduler');

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// 1. Webhook verification (Meta calls this once when you set up the webhook URL)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified.');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. Incoming messages
app.post('/webhook', async (req, res) => {
  // Always respond 200 fast so Meta doesn't retry/mark the webhook unhealthy
  res.sendStatus(200);

  try {
    const entry = req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];

    if (!message) return; // e.g. delivery/read receipts — ignore

    const fromPhone = message.from; // E.164 without '+'
    const text = message.text ? message.text.body : (message.button ? message.button.text : '');

    const reply = await handleMessage(fromPhone, text);
    await sendText(fromPhone, reply);
  } catch (err) {
    console.error('Error handling webhook message:', err);
  }
});

app.get('/', (req, res) => res.send('Equipment Tracker bot is running.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startScheduler();
});
