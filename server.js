const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 静的ファイルの配信
app.use(express.static(path.join(__dirname)));

// 1. Cloudflare R2 クライアントの設定
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// 2. Multerの設定（複数ファイル対応、合計サイズ制限200MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, 
});

// 3. 複数ファイル一括アップロード用APIエンドポイント
app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'ファイルが選択されていません。' });
    }

    const folder = req.body.folder || 'Image';
    const uploadedUrls = [];
    const publicDomain = process.env.R2_PUBLIC_DOMAIN.replace(/\/+$/, '');

    // 選択されたファイルを1つずつR2へアップロード
    for (const file of req.files) {
      const fileName = `${folder}/${Date.now()}-${file.originalname}`;

      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };

      const command = new PutObjectCommand(uploadParams);
      await s3Client.send(command);

      uploadedUrls.push({
        name: file.originalname,
        url: `${publicDomain}/${fileName}`
      });
    }

    res.json({
      success: true,
      message: `${uploadedUrls.length}件のファイルのアップロードに成功しました！`,
      urls: uploadedUrls,
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
