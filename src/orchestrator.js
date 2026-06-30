import 'dotenv/config';
import { persona } from './personas/smartplay.js';
import { generateTopics, generatePosts, generateImprovements, mergeImprovement } from './agents/contentWriter.js';
import { generateImages } from './agents/visualProvider.js';
import { publishPost } from './agents/socialPoster.js';
import {
  logToSheets, getFeedbackHistory, getPastTopics,
  getPostCount, getActivePrompt, updatePrompt,
  getPostsWithoutImages, updatePostImage
} from './sheets.js';
import { uploadToDrive } from './drive.js';
import {
  getBot, sendStatus, sendSuccess, sendError,
  sendTopicSelection, sendTextSelection, sendImageSelection,
  sendEditPrompt, sendImageFeedbackPrompt, sendCommentPrompt,
  sendRegeneratePrompt, sendImprovementSuggestion,
  sendPostPicker,                          // added to bot.js in Part 2
  waitForResponse
} from './bot.js';

const bot = getBot();
const GROUP_ID = process.env.TELEGRAM_GROUP_ID;

// ── improvement check (runs at start of /הפעל and /פוסט) ─────────────────────
async function runImprovementCheck(activeTextPrompt, activeImagePrompt) {
  const postCount = await getPostCount();
  if (postCount === 0 || postCount % 10 !== 0) return;

  await sendStatus(`🧠 <b>פוסט מספר ${postCount}!</b>\nמנתח את ההיסטוריה ומציע שיפורים...`);
  const postHistory = await getFeedbackHistory('posts');
  const imageFeedback = await getFeedbackHistory('images');
  const suggestions = await generateImprovements(postHistory, imageFeedback);

  for (let i = 0; i < suggestions.length; i++) {
    await sendImprovementSuggestion(suggestions[i], i);
    const response = await waitForResponse({ type: 'callback', prefix: 'improve_' });
    if (response.data.includes('approve')) {
      const currentPrompt = suggestions[i].type === 'text_prompt' ? activeTextPrompt : activeImagePrompt;
      await sendStatus('🔄 ממזג שיפור לתוך הפרומפט...');
      const updatedPrompt = await mergeImprovement(currentPrompt, suggestions[i].suggestion);
      await updatePrompt(suggestions[i].type, updatedPrompt);
      await sendStatus('✅ פרומפט עודכן ונשמר בגיליון!');
    } else {
      await sendStatus('❌ שיפור נדחה.');
    }
  }
  await sendStatus('ממשיך...');
}

// ── content writer sub-flow ───────────────────────────────────────────────────
// Returns { postId, selectedTopic, topics, posts, selectedPost, wasEdited }
async function runContentWriter(activeTextPrompt) {
  await sendStatus('מחפש נושאים רלוונטיים...');
  const pastTopics = await getPastTopics();
  const topics = await generateTopics(pastTopics, persona);
  await sendTopicSelection(topics);

  const topicResponse = await waitForResponse({ type: 'callback', prefix: 'topic_' });
  const topicIndex = parseInt(topicResponse.data.split('_')[1]);
  const selectedTopic = topics[topicIndex];
  await sendStatus(`נבחר: <b>${selectedTopic.title}</b>\nכותב שתי גרסאות...`);

  const feedbackHistory = await getFeedbackHistory();
  const posts = await generatePosts(selectedTopic, feedbackHistory, activeTextPrompt, persona);
  const postId = `post_${Date.now()}`;
  await sendTextSelection(posts, postId);

  const textResponse = await waitForResponse({ type: 'callback', prefix: 'text_' });
  const textIndex = parseInt(textResponse.data.split('_')[1]);
  let selectedPost = posts[textIndex];
  let wasEdited = false;

  await sendEditPrompt(selectedPost);
  const editResponse = await waitForResponse({ type: 'any', prefix: 'edit_skip' });
  if (editResponse.type === 'text') {
    selectedPost = editResponse.data;
    wasEdited = true;
    await sendStatus('✏️ טקסט עודכן!');
  }

  return { postId, selectedTopic, topics, posts, selectedPost, wasEdited };
}

// ── visual provider sub-flow ──────────────────────────────────────────────────
// Returns { imagePrompt, selectedDriveLink, imgIndex, rating, comment }
async function runVisualProvider(postText, activeImagePrompt, uploadId) {
  const imageFeedbackHistory = await getFeedbackHistory('images');
  let imageUrls, imagePrompt, selectedDriveLink, imgIndex;
  let rejectionRemarks = '';

  while (true) {
    await sendStatus('מייצר שתי תמונות...');
    const result = await generateImages(postText, imageFeedbackHistory, rejectionRemarks, activeImagePrompt, persona);
    imageUrls = result.images;
    imagePrompt = result.prompt;

    const tryUpload = (img, v) =>
      uploadToDrive(img, uploadId, v, 'pending').catch(e => {
        console.error('Drive upload error:', e.message);
        return null;
      });

    const [driveLink1, driveLink2] = await Promise.all([
      tryUpload(imageUrls[0], 1),
      tryUpload(imageUrls[1], 2)
    ]);

    await sendImageSelection(imageUrls, uploadId);
    const imgResponse = await waitForResponse({ type: 'callback', prefix: 'img_' });

    if (imgResponse.data.includes('reject')) {
      await sendRegeneratePrompt();
      const remarkResponse = await waitForResponse({ type: 'text' });
      rejectionRemarks = remarkResponse.data;
      continue;
    }

    imgIndex = parseInt(imgResponse.data.split('_')[1]);
    selectedDriveLink = imgIndex === 0 ? driveLink1 : driveLink2;
    break;
  }

  await sendImageFeedbackPrompt();
  const ratingResponse = await waitForResponse({ type: 'callback', prefix: 'rating_' });
  const rating = parseInt(ratingResponse.data.split('_')[1]);

  await sendCommentPrompt();
  const commentResponse = await waitForResponse({ type: 'any', prefix: 'comment_skip' });
  const comment = commentResponse.type === 'text' ? commentResponse.data : '';

  return { imagePrompt, selectedDriveLink, imgIndex, rating, comment };
}

// ── /הפעל — full flow ─────────────────────────────────────────────────────────
async function runFullFlow() {
  const [activeTextPrompt, activeImagePrompt] = await Promise.all([
    getActivePrompt('text_prompt', persona.postSystemPrompt),
    getActivePrompt('image_prompt', persona.imageBasePrompt)
  ]);

  await runImprovementCheck(activeTextPrompt, activeImagePrompt);

  const { postId, selectedTopic, topics, posts, selectedPost, wasEdited } = await runContentWriter(activeTextPrompt);

  const { imagePrompt, selectedDriveLink, imgIndex, rating, comment } =
    await runVisualProvider(selectedPost, activeImagePrompt, postId);

  await logToSheets('image_feedback', {
    post_id: postId,
    category: selectedTopic.category,
    version: imgIndex + 1,
    prompt: imagePrompt,
    rating,
    comment,
    approved: true,
    drive_link: selectedDriveLink || ''
  });

  await sendStatus('שומר נתונים...');
  await logToSheets('posts', {
    post_id: postId,
    category: selectedTopic.category,
    topic: selectedTopic.title,
    suggested_topics: topics.map(t => t.title).join(', '),
    original_post: posts[0],
    final_post: selectedPost,
    edited: wasEdited,
    image_prompt: imagePrompt,
    image_drive_link: selectedDriveLink || '',
    published_facebook: false,
    published_instagram: false
  });

  await publishPost(selectedPost, selectedDriveLink, persona);

  await sendSuccess(
    `✅ <b>פוסט מוכן ונשמר!</b>\n\n` +
    `<b>נושא:</b> ${selectedTopic.title}\n` +
    `<b>קטגוריה:</b> ${selectedTopic.category}\n\n` +
    `פרסום לפייסבוק ואינסטגרם יתווסף בקרוב.`
  );
}

// ── /פוסט — content writer only ───────────────────────────────────────────────
async function runContentOnly() {
  const [activeTextPrompt, activeImagePrompt] = await Promise.all([
    getActivePrompt('text_prompt', persona.postSystemPrompt),
    getActivePrompt('image_prompt', persona.imageBasePrompt)
  ]);

  await runImprovementCheck(activeTextPrompt, activeImagePrompt);

  const { postId, selectedTopic, topics, posts, selectedPost, wasEdited } = await runContentWriter(activeTextPrompt);

  await sendStatus('שומר פוסט...');
  await logToSheets('posts', {
    post_id: postId,
    category: selectedTopic.category,
    topic: selectedTopic.title,
    suggested_topics: topics.map(t => t.title).join(', '),
    original_post: posts[0],
    final_post: selectedPost,
    edited: wasEdited,
    image_prompt: '',
    image_drive_link: '',
    published_facebook: false,
    published_instagram: false
  });

  await sendSuccess(
    `✅ <b>פוסט נשמר!</b>\n\n` +
    `<b>נושא:</b> ${selectedTopic.title}\n\n` +
    `להוסיף תמונה — השתמש ב /תמונה`
  );
}

// ── /תמונה — visual provider only ────────────────────────────────────────────
async function runVisualOnly() {
  const activeImagePrompt = await getActivePrompt('image_prompt', persona.imageBasePrompt);

  // Show last 5 posts without images + "write your own" option
  const pendingPosts = await getPostsWithoutImages(5);
  await sendPostPicker(pendingPosts);
  const pickerResponse = await waitForResponse({ type: 'callback', prefix: 'pick_' });

  let postText, postId, category;

  if (pickerResponse.data === 'pick_own') {
    await sendStatus('כתוב את הטקסט שלך:');
    const textResponse = await waitForResponse({ type: 'text' });
    postText = textResponse.data;
    postId = null;
    category = 'standalone';
  } else {
    const idx = parseInt(pickerResponse.data.split('_')[1]);
    const chosenPost = pendingPosts[idx];
    postText = chosenPost['טקסט_סופי'];
    postId = chosenPost['post_id'];
    category = chosenPost['קטגוריה'];
  }

  const uploadId = postId || `standalone_${Date.now()}`;
  const { imagePrompt, selectedDriveLink, imgIndex, rating, comment } =
    await runVisualProvider(postText, activeImagePrompt, uploadId);

  await logToSheets('image_feedback', {
    post_id: uploadId,
    category,
    version: imgIndex + 1,
    prompt: imagePrompt,
    rating,
    comment,
    approved: true,
    drive_link: selectedDriveLink || ''
  });

  if (postId) {
    // Link image back to the existing post row in Sheets
    await updatePostImage(postId, selectedDriveLink, imagePrompt);
    await sendSuccess(`✅ <b>תמונה נשמרה ושויכה לפוסט!</b>`);
  } else {
    await sendSuccess(
      `✅ <b>תמונה נוצרה ונשמרה ב-Drive!</b>\n\nהתמונה לא שויכה לפוסט בגיליון.`
    );
  }
}

// ── Telegram command routing ──────────────────────────────────────────────────
function guard(msg) {
  return msg.chat.id.toString() === GROUP_ID;
}

async function handle(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    await sendError(e.message);
  }
}

bot.startPolling();
console.log(`Orchestrator listening for ${persona.name}...`);

bot.onText(/\/הפעל/, (msg) => { if (guard(msg)) handle(runFullFlow); });
bot.onText(/\/פוסט/,  (msg) => { if (guard(msg)) handle(runContentOnly); });
bot.onText(/\/תמונה/, (msg) => { if (guard(msg)) handle(runVisualOnly); });

bot.onText(/\/סטטוס/, async (msg) => {
  if (!guard(msg)) return;
  await sendStatus(
    `🤖 <b>סוכן פעיל — ${persona.name}</b>\n\n` +
    `פקודות:\n` +
    `/הפעל — תהליך מלא (פוסט + תמונה)\n` +
    `/פוסט — כתיבת פוסט בלבד\n` +
    `/תמונה — יצירת תמונה בלבד\n` +
    `/סטטוס — מצב הסוכן\n` +
    `/עזרה — הסבר על התהליך והפקודות`
  );
});

bot.onText(/\/עזרה/, async (msg) => {
  if (!guard(msg)) return;
  await sendStatus(
    `📖 <b>איך עובד הסוכן?</b>\n\n` +

    `<b>התהליך המלא:</b>\n` +
    `1. <b>בחירת נושא</b> — הסוכן מציע 5 נושאים לפוסט. בוחרים אחד.\n` +
    `2. <b>בחירת פוסט</b> — הסוכן כותב 2 גרסאות. בוחרים את המועדפת.\n` +
    `3. <b>עריכה</b> — אפשר לשלוח גרסה ערוכה, או לדלג ולהמשיך עם הטקסט הנבחר.\n` +
    `4. <b>יצירת תמונה</b> — הסוכן שולח את הפוסט לקלוד לתמצות ויזואלי, ויוצר 2 תמונות דרך OpenAI.\n` +
    `5. <b>בחירת תמונה</b> — בוחרים תמונה, או לוחצים "צור מחדש" עם הערה לשיפור.\n` +
    `6. <b>דירוג התמונה</b> — מדרגים 1–5 ואפשר להוסיף הערה. הסוכן לומד מזה.\n` +
    `7. <b>תיעוד ולמידה</b> — הפוסט, התמונה והפידבק נשמרים ב-Google Sheets ו-Drive. כל 10 פוסטים הסוכן מנתח את ההיסטוריה ומציע שיפורים לאישור.\n\n` +

    `<b>פקודות:</b>\n` +
    `<code>/הפעל</code> — תהליך מלא: פוסט + תמונה + שמירה\n` +
    `<code>/פוסט</code> — כתיבת פוסט בלבד, ללא תמונה (נשמר ב-Sheets, ניתן להוסיף תמונה אחר כך)\n` +
    `<code>/תמונה</code> — יצירת תמונה בלבד: בחירה מפוסטים קיימים ללא תמונה, או כתיבת טקסט חופשי\n` +
    `<code>/סטטוס</code> — בדיקה שהסוכן פעיל\n` +
    `<code>/עזרה</code> — התפריט הזה`
  );
});
