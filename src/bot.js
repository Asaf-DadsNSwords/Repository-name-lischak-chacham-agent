import TelegramBot from 'node-telegram-bot-api';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

let botInstance = null;

export function getBot() {
  if (!botInstance) {
    botInstance = new TelegramBot(TOKEN, { polling: false });
  }
  return botInstance;
}

export async function sendMessage(text) {
  const bot = getBot();
  return bot.sendMessage(GROUP_ID, text, { parse_mode: 'HTML' });
}

export async function sendStatus(text) {
  const bot = getBot();
  return bot.sendMessage(GROUP_ID, `ℹ️ ${text}`, { parse_mode: 'HTML' });
}

export async function sendError(text) {
  const bot = getBot();
  return bot.sendMessage(GROUP_ID, `❌ <b>שגיאה:</b> ${text}`, { parse_mode: 'HTML' });
}

export async function sendSuccess(text) {
  const bot = getBot();
  return bot.sendMessage(GROUP_ID, `✅ ${text}`, { parse_mode: 'HTML' });
}

// ─── שליחת 5 נושאים לבחירה ──────────────────────────────────────────────────
export async function sendTopicSelection(topics) {
  const bot = getBot();

  let text = '🎯 <b>נושאים לפוסט השבועי</b>\n\nבחרו נושא אחד:\n\n';
  topics.forEach((topic, i) => {
    text += `<b>${i + 1}. ${topic.title}</b>\n${topic.description}\n\n`;
  });

  const keyboard = {
    inline_keyboard: [
      topics.slice(0, 3).map((t, i) => ({ text: `${i + 1}. ${t.title}`, callback_data: `topic_${i}` })),
      topics.slice(3).map((t, i) => ({ text: `${i + 4}. ${t.title}`, callback_data: `topic_${i + 3}` }))
    ].filter(row => row.length > 0)
  };

  return bot.sendMessage(GROUP_ID, text, { parse_mode: 'HTML', reply_markup: keyboard });
}

// ─── שליחת 2 טקסטים לבחירה ──────────────────────────────────────────────────
export async function sendTextSelection(posts, postId) {
  const bot = getBot();

  for (let i = 0; i < posts.length; i++) {
    const label = i === 0 ? '📝 <b>גרסה א\'</b>' : '📝 <b>גרסה ב\'</b>';
    await bot.sendMessage(GROUP_ID, `${label}\n\n${posts[i]}`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `בחר גרסה ${i === 0 ? 'א\'': 'ב\''}`, callback_data: `text_${i}_${postId}` }
        ]]
      }
    });
  }
}

// ─── שליחת 2 תמונות לבחירה ──────────────────────────────────────────────────
export async function sendImageSelection(imageUrls, postId) {
  const bot = getBot();

  for (let i = 0; i < imageUrls.length; i++) {
    await bot.sendPhoto(GROUP_ID, imageUrls[i], {
      caption: `🖼️ <b>תמונה ${i === 0 ? 'א\'': 'ב\'}</b>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `בחר תמונה ${i === 0 ? 'א\'': 'ב\''}`, callback_data: `img_${i}_${postId}` }
        ]]
      }
    });
  }
}

// ─── המתנה לתגובה מהקבוצה ────────────────────────────────────────────────────
export function waitForResponse(filter, timeoutMs = 24 * 60 * 60 * 1000) {
  const bot = getBot();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      bot.removeListener('callback_query', onCallback);
      bot.removeListener('message', onMessage);
      reject(new Error('Timeout — לא התקבלה תגובה תוך 24 שעות'));
    }, timeoutMs);

    function onCallback(query) {
      if (query.message.chat.id.toString() !== GROUP_ID.toString()) return;
      if (filter.type === 'callback' && query.data.startsWith(filter.prefix)) {
        clearTimeout(timer);
        bot.removeListener('callback_query', onCallback);
        bot.removeListener('message', onMessage);
        bot.answerCallbackQuery(query.id);
        resolve({ type: 'callback', data: query.data, from: query.from });
      }
    }

    function onMessage(msg) {
      if (msg.chat.id.toString() !== GROUP_ID.toString()) return;
      if (filter.type === 'text') {
        clearTimeout(timer);
        bot.removeListener('callback_query', onCallback);
        bot.removeListener('message', onMessage);
        resolve({ type: 'text', data: msg.text, from: msg.from });
      }
    }

    bot.on('callback_query', onCallback);
    if (filter.type === 'text' || filter.type === 'any') {
      bot.on('message', onMessage);
    }
  });
}
