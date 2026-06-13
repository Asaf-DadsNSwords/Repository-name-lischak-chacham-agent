import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

// Returns array of 5 topic objects: { title, description, category }
export async function generateTopics(pastTopics = [], persona) {
  const newsResults = [];
  for (const terms of Object.values(persona.searchTerms).slice(0, 3)) {
    const result = await searchNews(terms[0]);
    if (result) newsResults.push(result.slice(0, 300));
  }

  const newsContext = newsResults.length > 0
    ? `חדשות רלוונטיות מהשבוע האחרון:\n${newsResults.join('\n')}\n\n`
    : 'לא נמצאו חדשות ספציפיות השבוע — הצע נושאים כלליים.\n\n';

  const avoidContext = pastTopics.length > 0
    ? `נושאים שכבר הוצעו בעבר — אל תחזור עליהם:\n${pastTopics.slice(-20).join('\n')}\n\n`
    : '';

  const prompt = `${newsContext}${avoidContext}${persona.topicsPromptContext}

הקטגוריות האפשריות: ${persona.categories.join(', ')}

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

// Returns array of 2 post strings
export async function generatePosts(topic, feedbackHistory = [], configOverrides = {}, persona) {
  let feedbackContext = '';
  if (feedbackHistory.length > 0) {
    const recent = feedbackHistory.slice(-8);
    feedbackContext = `\nלמידה מפידבקים קודמים:\n`;
    recent.forEach(f => {
      if (f.edit_type) feedbackContext += `- ${f.edit_type}: ${f.edit_notes}\n`;
    });
    feedbackContext += '\n';
  }

  const configAddition = configOverrides['text_prompt']
    ? `\nשיפורים שאושרו:\n- ${configOverrides['text_prompt'].value}\n`
    : '';

  const systemPrompt = `${persona.postSystemPrompt}${feedbackContext}${configAddition}`;

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
  return JSON.parse(raw).posts;
}

// Returns array of 2 suggestion objects: { type, description, suggestion }
export async function generateImprovements(postHistory, imageFeedback) {
  const recentPosts = postHistory.slice(-10);
  const recentImageFeedback = imageFeedback.slice(-10);

  const prompt = `You are analyzing the performance of a social media content agent for the channel "לשחק חכם" (parenting + gaming content).

Here is the recent post history (last 10 posts):
${recentPosts.map(p => `- Topic: ${p['נושא']} | Edited: ${p['נערך']} | Final text: ${p['טקסט_סופי']?.slice(0, 100)}...`).join('\n')}

Here is the recent image feedback (last 10):
${recentImageFeedback.map(f => `- Rating: ${f['דירוג']}/5 | Comment: ${f['הערה'] || 'none'} | Category: ${f['קטגוריה']}`).join('\n')}

Based on this data, suggest exactly 2 improvements:
1. One improvement to the TEXT writing style/prompt
2. One improvement to the IMAGE generation prompt

For each suggestion:
- Be specific and actionable
- Base it on patterns you see in the data (what was edited, low-rated images, comments)
- Write the suggested new instruction in Hebrew

Return JSON only:
[
  {
    "type": "text_prompt",
    "description": "short description of what you noticed",
    "suggestion": "the specific instruction to add to the text prompt"
  },
  {
    "type": "image_prompt",
    "description": "short description of what you noticed",
    "suggestion": "the specific instruction to add to the image prompt"
  }
]`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  const raw = response.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}
