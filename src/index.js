import 'dotenv/config';
import {
  sendStatus, sendSuccess, sendError,
  sendTopicSelection, sendTextSelection, sendImageSelection,
  waitForResponse, getBot
} from './bot.js';
import { generateTopics, generatePosts } from './agent.js';
import { generateImages } from './image.js';
import { logToSheets, getFeedbackHistory } from './sheets.js';
import { uploadToDrive } from './drive.js';

export async function runAgent(bot) {
  const postId = `post_${Date.now()}`;

  // ── שלב 1: יצירת 5 נושאים ──────────────────────────────────────────────────
  await sendStatus('מחפש נושאים רלוונטיים...');
  const topics = await generateTopics();
  await sendTopicSelection(topics);

  const topicResponse = await waitForResponse({ type: 'callback', prefix: 'topic_' });
  const topicIndex = parseInt(topicResponse.data.split('_')[1]);
  const selectedTopic = topics[topicIndex];
  await sendStatus(`נבחר: <b>${selectedTopic.title}</b>\nכותב שתי גרסאות...`);

  // ── שלב 2: יצירת 2 טקסטים ──────────────────────────────────────────────────
  const feedbackHistory = await getFeedbackHistory();
  const posts = await generatePosts(selectedTopic, feedbackHistory);
  await sendTextSelection(posts, postId);

  const textResponse = await waitForResponse({ type: 'callback', prefix: 'text_' });
  const textIndex = parseInt(textResponse.data.split('_')[1]);
  const selectedPost = posts[textIndex];
  await sendStatus('טקסט נבחר ✓\nמייצר שתי תמונות...');

  // ── שלב 3: יצירת 2 תמונות ──────────────────────────────────────────────────
  const imageFeedbackHistory = await getFeedbackHistory('images');
  const imageUrls = await generateImages(selectedTopic, imageFeedbackHistory);

  const [driveLink1, driveLink2] = await Promise.all([
    uploadToDrive(imageUrls[0], postId, 1, 'pending'),
    uploadToDrive(imageUrls[1], postId, 2, 'pending')
  ]);

  await sendImageSelection(imageUrls, postId);

  const imgResponse = await waitForResponse({ type: 'callback', prefix: 'img_' });
  const imgIndex = parseInt(imgResponse.data.split('_')[1]);
  const selectedImageUrl = imageUrls[imgIndex];
  const selectedDriveLink = imgIndex === 0 ? driveLink1 : driveLink2;

  await sendStatus('תמונה נבחרה ✓\nשומר נתונים...');

  // ── שלב 4: שמירה ב-Sheets (פרסום Meta יתווסף בשלב הבא) ────────────────────
  await logToSheets('posts', {
    post_id: postId,
    date: new Date().toISOString(),
    category: selectedTopic.category,
    topic: selectedTopic.title,
    original_post: posts[0],
    final_post: selectedPost,
    edited: textIndex !== 0,
    image_drive_link: selectedDriveLink,
    published_facebook: false,
    published_instagram: false
  });

  await sendSuccess(
    `✅ <b>פוסט מוכן ונשמר!</b>\n\n` +
    `<b>נושא:</b> ${selectedTopic.title}\n` +
    `<b>קטגוריה:</b> ${selectedTopic.category}\n\n` +
    `פרסום לפייסבוק ואינסטגרם יתווסף בקרוב.`
  );
}

// הפעלה ישירה (GitHub Actions)
if (process.argv[1].endsWith('index.js')) {
  const bot = getBot();
  bot.startPolling();

  runAgent(bot)
    .catch(async (error) => {
      console.error('Agent error:', error);
      await sendError(error.message);
    })
    .finally(() => {
      bot.stopPolling();
      process.exit(0);
    });
}
