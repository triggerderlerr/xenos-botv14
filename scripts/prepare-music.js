const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function downloadYtDlp() {
  const binDir = path.join(__dirname, '../bin');
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  const targetPath = path.join(binDir, binName);

  if (fs.existsSync(targetPath)) {
    console.log(`[MUSIC PREPARE] yt-dlp zaten mevcut: ${targetPath}`);
    return;
  }

  const url = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  console.log(`[MUSIC PREPARE] yt-dlp indiriliyor (${url}) -> ${targetPath}...`);

  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    maxRedirects: 10,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const writer = fs.createWriteStream(targetPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      try {
        if (!isWin) {
          fs.chmodSync(targetPath, 0o755);
        }
        console.log(`[MUSIC PREPARE] yt-dlp başarıyla indirildi ve hazırlandı.`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
    writer.on('error', reject);
  });
}

downloadYtDlp().catch(err => {
  console.error('[MUSIC PREPARE HATA]', err.message);
});
