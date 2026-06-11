import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_PROMPT = `raw, candid documentary photograph. Shot on 35mm film with natural, unpolished daylight creating realistic shadows. The environment is messy and lived-in, with visible dust, scuffs, and texture. The person looks completely authentic with imperfect skin texture, visible pores, slight sweat, and natural blemishes. Unedited, non-glossy, gritty realism. fully clothed, family-friendly, safe for work, no romantic content`;

async function extractVisualConcept(postText) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `Based on the post below, write a short visual description in English (max 15 words).
Rules:
- Describe what is happening in the image, not what the text says
- Family-friendly, safe for work, no controversial content
- Focus on emotions and setting: parent and child interaction
- No violence, romance, or sensitive themes
- Avoid gaming jargon that could be misinterpreted (e.g. "skins", "shooting", "killing")
- Use neutral family scene language only
- Return only the visual description, no explanation

Post:
${postText}`
    }]
  });
  return response.content[0].text.trim();
}

async function buildPrompt(topic, postText, feedbackHistory = [], rejectionRemarks = '') {
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

  const visualConcept = await extractVisualConcept(postText);

  let prompt = `${BASE_PROMPT}, ${visualConcept}`;

  if (learnedGood.length > 0)
    prompt += `\n\nPREFERRED STYLE (based on past approvals): ${learnedGood.slice(-3).join(', ')}`;
  if (learnedBad.length > 0)
    prompt += `\n\nAVOID: ${learnedBad.slice(-3).join(', ')}`;

  if (rejectionRemarks)
    prompt += `\n\nUSER FEEDBACK ON PREVIOUS IMAGES (apply this): ${rejectionRemarks}`;

  console.log('Visual concept:', visualConcept);
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

export async function generateImages(topic, postText, feedbackHistory = [], rejectionRemarks = '') {
  const prompt = await buildPrompt(topic, postText, feedbackHistory, rejectionRemarks);
  console.log('Generating 2 images with prompt:', prompt.slice(0, 100) + '...');

  const [img1, img2] = await Promise.all([
    openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 }),
    openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
  ]);

  return { images: [img1.data[0].b64_json, img2.data[0].b64_json], prompt };
}

export async function downloadImage(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}
