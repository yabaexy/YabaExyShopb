import express from 'express';
import { createClient } from '@libsql/client';
import requestIp from 'request-ip';
import cors from 'cors';
import geoip from 'geoip-lite';
import path from 'path';
import { put } from '@vercel/blob'; // [추가] Blob 업로드 함수

// [1] DB 클라이언트 설정 - 직접 주소를 문자열로 입력하여 오타 방지
const client = createClient({
  url: 'libsql://database-bistre-garden-vercel-icfg-kqt2ce1zvk7qrfygbdevgcfg.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU2NTQ1NzEsImlkIjoiMDE5ZDZkNDItOGQwMS03ZmVkLWEzYjgtZDQ1NGRjZGU1OTczIiwicmlkIjoiOTg5MzY4MDQtMzRjNS00ZGFiLTg5ZTEtODBjMDg5YTg0Y2MxIn0.tCxaxRdnR6ECXTZSQqvJShEjzfYrr9llqOHr7kxMtAs3i8bfH0BX8JHhEO-6eScEOnxtFU4Heqs4s_rjWxSVDA',
});

const app = express();

// [2] 미들웨어 설정 (Vercel 최적화: 함수 밖에서 즉시 적용)
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(requestIp.mw());

const BLOCKED_COUNTRIES = ['CN', 'RU', 'BY', 'CU', 'HK', 'MO', 'KP', 'IR'];

// 알림 생성 헬퍼 함수
const createNotification = async (recipient: string, sender: string, type: string, message: string, listingId?: string) => {
  if (recipient.toLowerCase() === sender.toLowerCase()) return;
  const id = Math.random().toString(36).substr(2, 9);
  await client.execute({
    sql: 'INSERT INTO notifications (id, recipientAddress, senderAddress, type, message, listingId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [id, recipient, sender, type, message, listingId || null, Date.now()]
  });
};

// [3] 모든 API 경로 (기능 누락 없이 포함)

app.get('/api/geo', (req, res) => {
  const ip = req.clientIp;
  const geo = geoip.lookup(ip || '');
  res.json({ country: geo ? geo.country : 'Unknown' });
});

app.get('/api/listings', async (req, res) => {
  try {
    const result = await client.execute('SELECT * FROM listings ORDER BY createdAt DESC');
    res.json(result.rows.map((l: any) => ({
      ...l,
      isDigital: !!l.isDigital,
      allowBidding: !!l.allowBidding,
      allowCustomOrder: !!l.allowCustomOrder
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/listings', async (req, res) => {
  try {
    const listing = req.body;
    let finalImageUrl = listing.imageUrl;

    // 만약 이미지 데이터가 Base64(data:image/...) 형태로 왔다면 Blob에 저장
    if (finalImageUrl && finalImageUrl.startsWith('data:image')) {
      const blob = await put(`listings/${listing.id}.png`, Buffer.from(finalImageUrl.split(',')[1], 'base64'), {
        access: 'public', // [중요] 누구나 볼 수 있게 공개 설정
      });
      finalImageUrl = blob.url; // Turso에는 Blob URL 저장
    }

    await client.execute({
      sql: `INSERT OR REPLACE INTO listings (
        id, title, description, price, imageUrl, seller, createdAt, category, 
        isDigital, downloadUrl, allowBidding, allowCustomOrder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        listing.id, listing.title, listing.description, listing.price, 
        finalImageUrl, // 변환된 URL 사용
        listing.seller, listing.createdAt, listing.category, 
        listing.isDigital ? 1 : 0, listing.downloadUrl, 
        listing.allowBidding ? 1 : 0, listing.allowCustomOrder ? 1 : 0
      ]
    });
    res.json({ success: true, imageUrl: finalImageUrl });
  } catch (error: any) {
    console.error("Listing Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/profiles/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const result = await client.execute({
      sql: 'SELECT * FROM profiles WHERE address = ?',
      args: [address]
    });
    
    const profile = result.rows[0];
    if (profile) {
      // DB에 저장된 문자열 형태의 JSON을 다시 객체로 변환해서 보냅니다.
      res.json({
        ...profile,
        gamesCompletedToday: JSON.parse((profile.gamesCompletedToday as string) || '{}')
      });
    } else {
      res.status(404).json({ error: "Profile not found" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/profiles', async (req, res) => {
  try {
    const p = req.body;
    let finalAvatarUrl = p.avatarUrl;

    // 아바타 이미지가 Base64인 경우 처리
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:image')) {
      const blob = await put(`profiles/${p.address}.png`, Buffer.from(finalAvatarUrl.split(',')[1], 'base64'), {
        access: 'public', // [중요] 공개 설정
      });
      finalAvatarUrl = blob.url;
    }

    await client.execute({
      sql: `INSERT OR REPLACE INTO profiles (
        address, ympBalance, lastLoginDate, loginStreak, gamesCompletedToday, role, nickname, avatarUrl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.address, p.ympBalance, p.lastLoginDate, p.loginStreak, 
        JSON.stringify(p.gamesCompletedToday || {}), p.role, p.nickname, 
        finalAvatarUrl // 변환된 URL 사용
      ]
    });
    res.json({ success: true, avatarUrl: finalAvatarUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
// 알림 및 기타 기능
app.get('/api/notifications/:address', async (req, res) => {
  try {
    const result = await client.execute({
      sql: 'SELECT * FROM notifications WHERE recipientAddress = ? ORDER BY timestamp DESC LIMIT 50',
      args: [req.params.address]
    });
    // isRead(0 or 1)를 불리언(true/false)으로 변환하여 전달
    res.json(result.rows.map((n: any) => ({ ...n, isRead: !!n.isRead })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/comments', async (req, res) => {
  try {
    const { id, listingId, authorAddress, text, timestamp, sellerAddress } = req.body;
    
    // 1. 댓글 저장
    await client.execute({
      sql: 'INSERT INTO comments (id, listingId, authorAddress, text, timestamp) VALUES (?, ?, ?, ?, ?)',
      args: [id, listingId, authorAddress, text, timestamp]
    });

    // 2. 판매자에게 알림 생성 (헬퍼 함수 createNotification 활용)
    if (sellerAddress) {
      await createNotification(
        sellerAddress, 
        authorAddress, 
        'comment', 
        `새로운 댓글이 달렸습니다: ${text.substring(0, 20)}...`, 
        listingId
      );
    }
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// [4] 정적 파일 제공 (프로덕션 환경 전용)
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
}

// [5] 서버리스 핸들러 내보내기 (Vercel용)
export default app;

// 로컬 실행용 (Vercel에서는 무시됨)
if (process.env.NODE_ENV !== 'production') {
  app.listen(3000, () => console.log('Server running on http://localhost:3000'));
}