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
  image_feedback: 'פידבק תמונות',
  config: 'קונפיגורציה'
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
  ],
  config: [
    'תאריך', 'סוג', 'תיאור_השינוי', 'ערך', 'פעיל'
  ]
};

async function ensureSheet(sheetType) {
  const sheets = getSheets();
  const sheetName = SHEET_NAMES[sheetType];

  // Check which tabs exist
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existingNames = meta.data.sheets.map(s => s.properties.title);

  if (!existingNames.includes(sheetName)) {
    // Create the missing tab
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: sheetName } } }] }
    });
    // Write headers to the new tab
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS[sheetType]] }
    });
    console.log(`Created sheet: ${sheetName}`);
    return;
  }

  // Tab exists — check for headers
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
    console.error(`Error ensuring headers for ${sheetName}:`, err.message);
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

export async function getPostCount() {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAMES.posts}!A:A`
    });
    const rows = res.data.values || [];
    return Math.max(0, rows.length - 1);
  } catch {
    return 0;
  }
}

export async function saveConfig(type, description, value) {
  const sheets = getSheets();
  await ensureSheet('config');
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAMES.config}!A:Z`,
    valueInputOption: 'RAW',
    requestBody: { values: [[
      new Date().toLocaleDateString('he-IL'),
      type,
      description,
      value,
      'כן'
    ]] }
  });
  console.log(`Config saved: ${type}`);
}

export async function getPostsWithoutImages(n = 5) {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAMES.posts}!A:Z`
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return [];
    const headers = rows[0];
    const driveLinkCol = headers.indexOf('drive_link_תמונה');
    const postIdCol = headers.indexOf('post_id');
    const topicCol = headers.indexOf('נושא');
    const categoryCol = headers.indexOf('קטגוריה');
    const finalPostCol = headers.indexOf('טקסט_סופי');
    const dateCol = headers.indexOf('תאריך');
    return rows.slice(1)
      .filter(row => !row[driveLinkCol])
      .slice(-n)
      .map(row => ({
        'post_id': row[postIdCol] || '',
        'נושא': row[topicCol] || '',
        'קטגוריה': row[categoryCol] || '',
        'טקסט_סופי': row[finalPostCol] || '',
        'תאריך': row[dateCol] || ''
      }));
  } catch {
    return [];
  }
}

export async function updatePostImage(postId, driveLink, imagePrompt) {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAMES.posts}!A:Z`
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return;
    const headers = rows[0];
    const postIdCol = headers.indexOf('post_id');
    const driveLinkCol = headers.indexOf('drive_link_תמונה');
    const imagePromptCol = headers.indexOf('פרומפט_תמונה');
    const rowIndex = rows.findIndex((row, i) => i > 0 && row[postIdCol] === postId);
    if (rowIndex === -1) { console.error(`updatePostImage: post_id ${postId} not found`); return; }
    const sheetRow = rowIndex + 1;
    await Promise.all([
      sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.posts}!${columnLetter(driveLinkCol)}${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[driveLink || '']] }
      }),
      sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAMES.posts}!${columnLetter(imagePromptCol)}${sheetRow}`,
        valueInputOption: 'RAW',
        requestBody: { values: [[imagePrompt || '']] }
      })
    ]);
    console.log(`Updated image data for post ${postId}`);
  } catch (e) {
    console.error('updatePostImage error:', e.message);
  }
}

function columnLetter(index) {
  let letter = '';
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

export async function getActiveConfig() {
  const sheets = getSheets();
  try {
    await ensureSheet('config');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAMES.config}!A:Z`
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return {};
    const headers = rows[0];
    const config = {};
    rows.slice(1).forEach(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      if (obj['פעיל'] === 'כן') {
        config[obj['סוג']] = { value: obj['ערך'], description: obj['תיאור_השינוי'] };
      }
    });
    return config;
  } catch {
    return {};
  }
}
