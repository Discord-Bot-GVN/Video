const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// index.htmlなどの静的ファイルをブラウザに表示できるようにする設定
app.use(express.static(path.join(__dirname)));

// 1. 環境変数からCloudflare R2のクライアントを設定
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// 2. Multerの設定（メモリ上に一時保持、ファイルサイズ制限100MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, 
});

// 3. アップロード用APIエンドポイント
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルが選択されていません。' });
    }

    const file = req.file;
    // ファイル名の重複を防ぐために一意のプレフィックスを付与
    const fileName = `${Date.now()}-${file.originalname}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    // R2へ送信
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // スラッシュの重複（//）を防ぐために末尾のスラッシュを削除してから結合
    const publicDomain = process.env.R2_PUBLIC_DOMAIN.replace(/\/+$/, '');
    const fileUrl = `${publicDomain}/${fileName}`;

    res.json({
      success: true,
      message: 'アップロードに成功しました！',
      url: fileUrl,
    });
  } catch (error) {
    console.error('詳細エラー:', error);
    res.status(500).json({ 
      error: 'アップロード失敗', 
      details: error.message,
      code: error.Code || error.name 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
