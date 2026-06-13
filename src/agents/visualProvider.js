import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Claude reads the post and extracts a concrete visual scene description
async function extractVisualConcept(postText) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `Based on the post below, write a short visual description in English (max 20 words).
Rules:
- Describe what is happening in the image
- KEEP the specific context (e.g. if the post is about video games, show a parent and child playing video games together)
- Do not generalize — "collaborating on activity" is wrong if the post is specifically about gaming
- Family-friendly, safe for work, no controversial content
- No violence, romance, or sensitive themes
- Avoid only these specific words: "skins", "shooting", "killing", "gun"
- Return only the visual description, no explanation

Post:
${postText}`
    }]
  });
  return response.content[0].text.trim();
}

async function buildPrompt(postText, feedbackHistory = [], rejectionRemarks = '', configOverrides = {}, persona) {
  const learnedGood = [];
  const learnedBad = [];

  if (feedbackHistory.length >= 5) {
    feedbackHistory.filter(f => f.rating >= 4).forEach(f => {
      if (f.comment) learnedGood.push(f.comment);
    });
    feedbackHistory.filter(f => f.rating <= 2).forEach(f => {
      if (f.comment) learnedBad.push(f.comment);
    });
  }

  const visualConcept = await extractVisualConcept(postText);
  console.log('Visual concept:', visualConcept);

  let prompt = `${persona.imageBasePrompt}, ${visualConcept}`;

  if (learnedGood.length > 0)
    prompt += `\n\nPREFERRED STYLE (based on past approvals): ${learnedGood.slice(-3).join(', ')}`;
  if (learnedBad.length > 0)
    prompt += `\n\nAVOID: ${learnedBad.slice(-3).join(', ')}`;

  if (configOverrides['image_prompt'])
    prompt += `\n\nAPPROVED STYLE IMPROVEMENTS: ${configOverrides['image_prompt'].value}`;

  if (rejectionRemarks)
    prompt += `\n\nUSER FEEDBACK ON PREVIOUS IMAGES (apply this): ${rejectionRemarks}`;

  return prompt;
}

// Returns { images: [base64, base64], prompt }
export async function generateImages(postText, feedbackHistory = [], rejectionRemarks = '', configOverrides = {}, persona) {
  const prompt = await buildPrompt(postText, feedbackHistory, rejectionRemarks, configOverrides, persona);
  console.log('Generating 2 images with prompt:', prompt.slice(0, 100) + '...');

  const [img1, img2] = await Promise.all([
    openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 }),
    openai.images.generate({ model: 'gpt-image-1', prompt, size: '1024x1024', quality: 'medium', n: 1 })
  ]);

  return { images: [img1.data[0].b64_json, img2.data[0].b64_json], prompt };
}
