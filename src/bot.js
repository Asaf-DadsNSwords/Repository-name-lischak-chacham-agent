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
export async function sendImageSelection(imagesBase64, postId) {
  const bot = getBot();

  for (let i = 0; i < imagesBase64.length; i++) {
    const buffer = Buffer.from(imagesBase64[i], 'base64');
    await bot.sendPhoto(GROUP_ID, buffer, {
      caption: `🖼️ <b>תמונה ${i === 0 ? "א'": "ב'"}</b>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `בחר תמונה ${i === 0 ? "א'": "ב'"}`, callback_data: `img_${i}_${postId}` }
        ]]
      }
    });
  }

  await bot.sendMessage(GROUP_ID,
    `❌ <b>לא מרוצה מהתמונות?</b>\n\nלחץ "צור מחדש" וכתוב הערה — הסוכן ייצור שתי תמונות חדשות.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 צור מחדש', callback_data: `img_reject_${postId}` }
        ]]
      }
    }
  );
}

// ─── בקשת הערה לצורך יצירה מחדש ─────────────────────────────────────────────
export async function sendRegeneratePrompt() {
  const bot = getBot();
  await bot.sendMessage(GROUP_ID,
    `✏️ <b>מה לשפר בתמונה?</b>\n\nכתוב הערה ספציפית (למשל: "יותר חיצוני", "פחות רציני", "ילד קטן יותר")`,
    { parse_mode: 'HTML' }
  );
}

// ─── בקשת עריכת טקסט ────────────────────────────────────────────────────────
export async function sendEditPrompt(selectedText) {
  const bot = getBot();
  await bot.sendMessage(GROUP_ID,
    `✏️ <b>רוצה לערוך את הטקסט?</b>\n\nכתוב את הגרסה הסופית שלך, או לחץ <b>דלג</b> להמשיך עם הטקסט הנוכחי.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'דלג ←', callback_data: 'edit_skip' }]]
      }
    }
  );
}

// ─── בקשת פידבק על תמונה ─────────────────────────────────────────────────────
export async function sendImageFeedbackPrompt() {
  const bot = getBot();
  await bot.sendMessage(GROUP_ID,
    `⭐ <b>מה דעתך על התמונה הנבחרת?</b>\n\nדרג מ-1 עד 5 ואפשר להוסיף הערה (אופציונלי).`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [1,2,3,4,5].map(n => ({ text: `${n}⭐`, callback_data: `rating_${n}` }))
        ]
      }
    }
  );
}

// ─── בקשת הערה אופציונלית ────────────────────────────────────────────────────
export async function sendCommentPrompt() {
  const bot = getBot();
  await bot.sendMessage(GROUP_ID,
    `💬 <b>הערה לתמונה (אופציונלי)</b>\n\nכתוב הערה לשיפור עתידי, או לחץ דלג.`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: 'דלג ←', callback_data: 'comment_skip' }]]
      }
    }
  );
}

// ─── בחירת פוסט קיים או כתיבה עצמאית (לתהליך /תמונה) ───────────────────────
export async function sendPostPicker(posts) {
  const bot = getBot();

  let text = '🖼️ <b>יצירת תמונה</b>\n\nבחר פוסט לשיוך התמונה, או כתוב טקסט חופשי:\n\n';

  const buttons = [];

  if (posts.length === 0) {
    text += 'אין פוסטים ללא תמונה.\n';
  } else {
    posts.forEach((post, i) => {
      text += `<b>${i + 1}. ${post['נושא']}</b> — ${post['תאריך']}\n`;
      buttons.push([{ text: `${i + 1}. ${post['נושא']}`, callback_data: `pick_${i}` }]);
    });
    text += '\n';
  }

  buttons.push([{ text: '✍️ כתוב טקסט משלך', callback_data: 'pick_own' }]);

  return bot.sendMessage(GROUP_ID, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ─── הצגת הצעות שיפור לאישור ─────────────────────────────────────────────────
export async function sendImprovementSuggestion(suggestion, index) {
  const bot = getBot();
  const typeLabel = suggestion.type === 'text_prompt' ? '📝 שיפור טקסט' : '🖼️ שיפור תמונה';
  await bot.sendMessage(GROUP_ID,
    `🔍 <b>הצעת שיפור ${index + 1}/2 — ${typeLabel}</b>\n\n` +
    `<b>מה זיהינו:</b> ${suggestion.description}\n\n` +
    `<b>הצעה:</b> ${suggestion.suggestion}`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ אשר', callback_data: `improve_approve_${index}` },
          { text: '❌ דחה', callback_data: `improve_reject_${index}` }
        ]]
      }
    }
  );
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

    function done(result) {
      clearTimeout(timer);
      bot.removeListener('callback_query', onCallback);
      bot.removeListener('message', onMessage);
      resolve(result);
    }

    function onCallback(query) {
      if (query.message.chat.id.toString() !== GROUP_ID.toString()) return;
      const isMatch =
        (filter.type === 'callback' && query.data.startsWith(filter.prefix)) ||
        (filter.type === 'any' && query.data.startsWith(filter.prefix));
      if (isMatch) {
        bot.answerCallbackQuery(query.id);
        done({ type: 'callback', data: query.data, from: query.from });
      }
    }

    function onMessage(msg) {
      if (msg.chat.id.toString() !== GROUP_ID.toString()) return;
      if (!msg.text || msg.text.startsWith('/')) return;
      if (filter.type === 'text' || filter.type === 'any') {
        done({ type: 'text', data: msg.text, from: msg.from });
      }
    }

    bot.on('callback_query', onCallback);
    if (filter.type === 'text' || filter.type === 'any') {
      bot.on('message', onMessage);
    }
  });
}
