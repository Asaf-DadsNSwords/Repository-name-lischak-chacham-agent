import { google } from 'googleapis';
import axios from 'axios';
import { Readable } from 'stream';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

function getAuth() {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/drive']
  });
}

export async function uploadToDrive(imageBase64, postId, version, status) {
  const drive = google.drive({ version: 'v3', auth: getAuth() });

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  const date = new Date().toISOString().split('T')[0];
  const fileName = `${date}_${postId}_v${version}_${status}.png`;

  const monthFolder = await getOrCreateMonthFolder(drive);

  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [monthFolder] },
    media: { mimeType: 'image/png', body: Readable.from(imageBuffer) },
    fields: 'id, webViewLink'
  });

  console.log(`Uploaded to Drive: ${fileName}`);
  return response.data.webViewLink;
}

async function getOrCreateMonthFolder(drive) {
  const now = new Date();
  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const folderName = `${String(now.getMonth() + 1).padStart(2, '0')}-${monthNames[now.getMonth()]}`;

  const search = await drive.files.list({
    q: `name='${folderName}' and '${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder'`,
    fields: 'files(id)'
  });

  if (search.data.files.length > 0) return search.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [FOLDER_ID]
    },
    fields: 'id'
  });

  return folder.data.id;
}
