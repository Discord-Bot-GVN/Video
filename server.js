const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Renderなどの環境変数、またはダッシュボードの設定から読み込み
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

// 2. Multerの設定（メモリ上に一時保持。動画や大きな画像に対応するため制限を緩和：例 100MB）
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
      ContentType: file.mimetype, // ← 写真（image/jpeg, image/png等）や動画のMIMEタイプを正確に渡す
    };

    // R2へ送信
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // 公開URLの返却（R2バケット側でパブリックアクセスまたはカスタムドメイン設定が有効な場合）
    const fileUrl = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;

    res.json({
      success: true,
      message: 'アップロードに成功しました！',
      url: fileUrl,
    });
  } catch (error) {
    console.error('アップロードエラー:', error);
    res.status(500).json({ error: 'サーバー側でアップロードに失敗しました。', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
