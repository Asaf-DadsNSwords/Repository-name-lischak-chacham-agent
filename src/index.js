import 'dotenv/config';
import {
  sendStatus, sendSuccess, sendError,
  sendTopicSelection, sendTextSelection, sendImageSelection,
  sendEditPrompt, sendImageFeedbackPrompt,
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
  let selectedPost = posts[textIndex];
  let wasEdited = false;

  // ── שלב עריכת טקסט ──────────────────────────────────────────────────────────
  await sendEditPrompt(selectedPost);
  const editResponse = await waitForResponse({ type: 'any', prefix: 'edit_skip' });
  if (editResponse.type === 'text') {
    selectedPost = editResponse.data;
    wasEdited = true;
    await sendStatus('✏️ טקסט עודכן!\nמייצר שתי תמונות...');
  } else {
    await sendStatus('טקסט נבחר ✓\nמייצר שתי תמונות...');
  }

  // ── שלב 3: יצירת 2 תמונות ──────────────────────────────────────────────────
  const imageFeedbackHistory = await getFeedbackHistory('images');
  const imageUrls = await generateImages(selectedTopic, imageFeedbackHistory);

  const tryUpload = (img, v) => uploadToDrive(img, postId, v, 'pending').catch(() => null);
  const [driveLink1, driveLink2] = await Promise.all([
    tryUpload(imageUrls[0], 1),
    tryUpload(imageUrls[1], 2)
  ]);

  await sendImageSelection(imageUrls, postId);

  const imgResponse = await waitForResponse({ type: 'callback', prefix: 'img_' });
  const imgIndex = parseInt(imgResponse.data.split('_')[1]);
  const selectedImageUrl = imageUrls[imgIndex];
  const selectedDriveLink = imgIndex === 0 ? driveLink1 : driveLink2;

  // ── שלב פידבק תמונה ──────────────────────────────────────────────────────────
  await sendImageFeedbackPrompt();
  const ratingResponse = await waitForResponse({ type: 'callback', prefix: 'rating_' });
  const rating = parseInt(ratingResponse.data.split('_')[1]);

  await sendStatus('מעולה! שולח הערה אופציונלית...\n(כתוב הערה או שלח /דלג)');
  const commentResponse = await waitForResponse({ type: 'any', prefix: 'skip' });
  const comment = commentResponse.type === 'text' ? commentResponse.data : '';

  await logToSheets('image_feedback', {
    post_id: postId,
    category: selectedTopic.category,
    version: imgIndex + 1,
    rating,
    comment,
    approved: true,
    drive_link: selectedDriveLink || ''
  });

  await sendStatus('תמונה נבחרה ✓\nשומר נתונים...');

  // ── שלב 4: שמירה ב-Sheets (פרסום Meta יתווסף בשלב הבא) ────────────────────
  await logToSheets('posts', {
    post_id: postId,
    date: new Date().toISOString(),
    category: selectedTopic.category,
    topic: selectedTopic.title,
    original_post: posts[0],
    final_post: selectedPost,
    edited: wasEdited,
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
