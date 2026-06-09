import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BASE_PROMPT = `Israeli family, parent and child, warm home atmosphere,
minimalist style, soft blue and orange palette, no screens visible,
friendly and calm mood, social media post style, square format 1080x1080,
natural lighting, cozy living room setting`;

function buildPrompt(topic, feedbackHistory = []) {
  let learnedGood = [];
  let learnedBad = [];

  if (feedbackHistory.length >= 5) {
    feedbackHistory.filter(f => f.rating >= 4).forEach(f => {
      if (f.comment) learnedGood.push(f.comment);
    });
    feedbackHistory.filter(f => f.rating <= 2).forEach(f => {
      if (f.comment) learnedBad.push(f.comment);
    });
  }

  const topicAddition = getTopicImageDetails(topic);
  let prompt = `${BASE_PROMPT}, ${topicAddition}`;

  if (learnedGood.length > 0)
    prompt += `\n\nPREFERRED STYLE (based on past approvals): ${learnedGood.slice(-3).join(', ')}`;
  if (learnedBad.length > 0)
    prompt += `\n\nAVOID: ${learnedBad.slice(-3).join(', ')}`;

  return prompt;
}

function getTopicImageDetails(topic) {
  const map = {
    'זמן מסך': 'parent and child having a calm conversation, clock visible in background, balanced mood',
    'טיפים למשחק עם ילדים': 'parent and child sitting together smiling, cooperative and playful atmosphere',
    'מורה נבוכים': 'parent looking curious and thoughtful, learning atmosphere, books or notes nearby',
    'הכר את המשחק': 'child excited and engaged, parent watching with interest, positive energy',
    'מחקרים וממצאים': 'clean informative mood, parent reading, calm and intellectual atmosphere'
  };
  return map[topic.category] || 'parent and child in positive interaction, warm family moment';
}

export async function generateImages(topic, feedbackHistory = []) {
  const prompt = buildPrompt(topic, feedbackHistory);
  console.log('Generating 2 images with prompt:', prompt.slice(0, 100) + '...');

  const [img1, img2] = await Promise.all([
    openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 }),
    openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
  ]);

  return [img1.data[0].b64_json, img2.data[0].b64_json];
}

export async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}
