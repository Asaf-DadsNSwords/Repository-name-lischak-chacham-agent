import 'dotenv/config';
import { getBot, sendMessage, sendStatus, sendError } from './bot.js';
import { runAgent } from './index.js';

const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

async function startListener() {
  const bot = getBot();
  bot.startPolling();

  console.log('🤖 הבוט פעיל — ממתין לפקודה /הפעל בטלגרם...');

  await sendMessage('🟢 <b>הבוט פעיל</b>\nשלחו /הפעל כדי להתחיל תהליך יצירת פוסט.');

  bot.onText(/\/הפעל/, async (msg) => {
    if (msg.chat.id.toString() !== GROUP_ID.toString()) return;

    await sendStatus(`התחלת תהליך — יצירת פוסט לערוץ "לשחק חכם"...`);

    try {
      await runAgent(bot);
    } catch (error) {
      console.error('Agent error:', error);
      await sendError(error.message);
    }
  });

  bot.onText(/\/סטטוס/, async (msg) => {
    if (msg.chat.id.toString() !== GROUP_ID.toString()) return;
    await sendMessage('🟢 <b>הבוט פעיל ומחכה לפקודות</b>\n\n/הפעל — התחל יצירת פוסט');
  });
}

startListener();
