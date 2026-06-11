import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = fs.readFileSync(path.join(__dirname, '../AGENT_CONFIG.md'), 'utf-8');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SEARCH_TERMS = {
  'זמן מסך': ['זמן מסך ילדים', 'screen time kids research', 'AAP screen time guidelines'],
  'טיפים למשחק עם ילדים': ['משחקים משפחתיים', 'gaming with kids tips', 'family gaming'],
  'מורה נבוכים': ['בקרת הורים', 'parental controls gaming', 'Game Pass explained'],
  'הכר את המשחק': ['פורטנייט ילדים', 'Roblox parents guide', 'Minecraft education'],
  'מחקרים וממצאים': ['מחקר גיימינג ילדים', 'video games children study 2025', 'gaming benefits kids research']
};

const CATEGORIES = Object.keys(SEARCH_TERMS);

async function searchNews(query) {
  try {
    const response = await axios.get('https://news.google.com/rss/search', {
      params: { q: query, hl: 'iw', gl: 'IL', ceid: 'IL:iw' },
      timeout: 5000
    });
    return response.data?.slice(0, 500) || '';
  } catch {
    return '';
  }
}

export async function generateTopics(pastTopics = []) {
  const newsResults = [];
  for (const terms of Object.values(SEARCH_TERMS).slice(0, 3)) {
    const result = await searchNews(terms[0]);
    if (result) newsResults.push(result.slice(0, 300));
  }

  const newsContext = newsResults.length > 0
    ? `חדשות רלוונטיות מהשבוע האחרון:\n${newsResults.join('\n')}\n\n`
    : 'לא נמצאו חדשות ספציפיות השבוע — הצע נושאים כלליים.\n\n';

  const avoidContext = pastTopics.length > 0
    ? `נושאים שכבר הוצעו בעבר — אל תחזור עליהם:\n${pastTopics.slice(-20).join('\n')}\n\n`
    : '';

  const prompt = `${newsContext}${avoidContext}אתה עוזר לערוץ "לשחק חכם" — ערוץ לתוכן הורות וגיימינג.

הקהל: הורים לילדים שחוששים מגיימינג ומסכים.
המסר: מעורבות הורית + הכרת התחום = גבולות בריאים.

הקטגוריות האפשריות: ${CATEGORIES.join(', ')}

הצע בדיוק 5 נושאים לפוסט שבועי. לכל נושא:
- כותרת קצרה (עד 6 מילים)
- משפט הסבר אחד (עד 20 מילה)
- קטגוריה מתוך הרשימה

החזר JSON בלבד, ללא טקסט נוסף:
[
  {"title": "...", "description": "...", "category": "..."},
  ...
]`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = response.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

export async function generatePosts(topic, feedbackHistory = []) {
  let feedbackContext = '';
  if (feedbackHistory.length > 0) {
    const recent = feedbackHistory.slice(-8);
    feedbackContext = `\nלמידה מפידבקים קודמים:\n`;
    recent.forEach(f => {
      if (f.edit_type) feedbackContext += `- ${f.edit_type}: ${f.edit_notes}\n`;
    });
    feedbackContext += '\n';
  }

  const systemPrompt = `אתה כותב תוכן לערוץ "לשחק חכם" בעברית.

קהל: הורים לילדים צעירים שחוששים מגיימינג ומסכים, אך פתוחים לזווית מאוזנת.

קול הערוץ:
- גוף ראשון רבים תמיד ("אנחנו", "אצלנו", "לדעתנו")
- טון: חברותי-מקצועי — לא אקדמי, לא סלנג
- לא שופטים הורים — אנחנו לצידם
- תמיד מציינים יתרון וחסרון כשרלוונטי

מבנה פוסט:
1. פתיחה: שאלה או טענה שמהדהדת עם הורים (1-2 משפטים)
2. גוף: תוכן מאוזן ומעשי (5-8 משפטים)
3. CTA: שאלה פתוחה שמזמינה דיון בתגובות

אורך: עד 150 מילה. פסקאות קצרות עם שורות ריקות ביניהן. עד 3 אמוג'י.
האשטגים בסוף: #לשחק_חכם #גיימינג_והורות #ילדים_ומסכים + האשטג ספציפי לנושא
${feedbackContext}
מה לא לכתוב:
- אל תגיד "המחקר מראה ש..." בלי מקור
- אל תשתמש ב: "חשוב לציין", "יש לזכור", "כידוע"
- אל תטיף — הצע, אל תכתיב`;

  const userPrompt = `כתוב שתי גרסאות שונות לפוסט בנושא: "${topic.title}"
קטגוריה: ${topic.category}

שתי הגרסאות לאותה פלטפורמה — שתיהן בפורמט זהה אבל עם זווית או פתיחה שונה.

החזר JSON בלבד:
{"posts": ["גרסה ראשונה...", "גרסה שנייה..."]}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  const raw = response.content[0].text.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(raw);
  return parsed.posts;
}
