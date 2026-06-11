import { google } from 'googleapis';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return auth;
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

const SHEET_NAMES = {
  posts: 'פוסטים',
  image_feedback: 'פידבק תמונות'
};

const HEADERS = {
  posts: [
    'תאריך', 'post_id', 'קטגוריה', 'נושא',
    'נושאים_שהוצעו',
    'טקסט_מקורי', 'טקסט_סופי',
    'נערך', 'פרומפט_תמונה', 'drive_link_תמונה',
    'פורסם_פייסבוק', 'פורסם_אינסטגרם'
  ],
  image_feedback: [
    'תאריך', 'post_id', 'קטגוריה', 'גרסה',
    'prompt', 'דירוג', 'הערה', 'אושרה', 'drive_link'
  ]
};

async function ensureSheet(sheetType) {
  const sheets = getSheets();
  const sheetName = SHEET_NAMES[sheetType];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1:Z1`
    });

    if (!res.data.values || res.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [HEADERS[sheetType]] }
      });
    }
  } catch (err) {
    console.error(`Error ensuring sheet ${sheetName}:`, err.message);
  }
}

export async function logToSheets(sheetType, data) {
  const sheets = getSheets();
  const sheetName = SHEET_NAMES[sheetType];

  await ensureSheet(sheetType);

  let row;

  if (sheetType === 'posts') {
    row = [
      new Date().toLocaleDateString('he-IL'),
      data.post_id,
      data.category,
      data.topic,
      data.suggested_topics || '',
      data.original_post,
      data.final_post,
      data.edited ? 'כן' : 'לא',
      data.image_prompt || '',
      data.image_drive_link || '',
      data.published_facebook ? 'כן' : 'לא',
      data.published_instagram ? 'כן' : 'לא'
    ];
  } else if (sheetType === 'image_feedback') {
    row = [
      new Date().toLocaleDateString('he-IL'),
      data.post_id,
      data.category,
      `v${data.version}`,
      data.prompt || '',
      data.rating,
      data.comment || '',
      data.approved ? 'כן' : 'לא',
      data.drive_link || ''
    ];
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A:Z`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  });

  console.log(`Logged to ${sheetName}`);
}

export async function getPastTopics() {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAMES.posts}!A:Z`
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return [];
    const headers = rows[0];
    const topicsCol = headers.indexOf('נושאים_שהוצעו');
    if (topicsCol === -1) return [];
    return rows.slice(1)
      .map(row => row[topicsCol] || '')
      .filter(Boolean)
      .flatMap(cell => cell.split(',').map(t => t.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getFeedbackHistory(type = 'posts') {
  const sheets = getSheets();
  const sheetName = SHEET_NAMES[type === 'images' ? 'image_feedback' : 'posts'];

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:Z`
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return [];

    const headers = rows[0];
    return rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });
  } catch {
    return [];
  }
}
