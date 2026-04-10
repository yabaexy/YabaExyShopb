import express from 'express';
import { createClient } from '@libsql/client';
import requestIp from 'request-ip';
import cors from 'cors';
import geoip from 'geoip-lite';
import path from 'path';

// [1] DB 클라이언트 설정 - 직접 주소를 문자열로 입력하여 오타 방지
const client = createClient({
  url: 'libsql://database-bistre-garden-vercel-icfg-kqt2ce1zvk7qrfygbdevgcfg.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU2NTQ1NzEsImlkIjoiMDE5ZDZkNDItOGQwMS03ZmVkLWEzYjgtZDQ1NGRjZGU1OTczIiwicmlkIjoiOTg5MzY4MDQtMzRjNS00ZGFiLTg5ZTEtODBjMDg5YTg0Y2MxIn0.tCxaxRdnR6ECXTZSQqvJShEjzfYrr9llqOHr7kxMtAs3i8bfH0BX8JHhEO-6eScEOnxtFU4Heqs4s_rjWxSVDA',
});

const app = express();

// [2] 미들웨어 설정 (Vercel 최적화: 함수 밖에서 즉시 적용)
app.use(cors());
app.use(express.json());
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
    console.log("Saving listing:", listing.id);
    
    // INSERT OR REPLACE를 사용하여 업데이트와 삽입을 동시에 처리
    await client.execute({
      sql: `INSERT OR REPLACE INTO listings (
        id, title, description, price, imageUrl, seller, createdAt, category, 
        isDigital, downloadUrl, allowBidding, allowCustomOrder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        listing.id, listing.title, listing.description, listing.price, 
        listing.imageUrl, listing.seller, listing.createdAt, listing.category, 
        listing.isDigital ? 1 : 0, listing.downloadUrl, 
        listing.allowBidding ? 1 : 0, listing.allowCustomOrder ? 1 : 0
      ]
    });
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Turso Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/profiles/:address', async (req, res) => {
  const profileResult = await client.execute({ sql: 'SELECT * FROM profiles WHERE address = ?', args: [req.params.address] });
  const profile = profileResult.rows[0];
  if (profile) {
    const wishlist = await client.execute({ sql: 'SELECT listingId FROM wishlist WHERE address = ?', args: [req.params.address] });
    const purchases = await client.execute({ sql: 'SELECT * FROM purchases WHERE buyerAddress = ?', args: [req.params.address] });
    res.json({ ...profile, gamesCompletedToday: JSON.parse((profile.gamesCompletedToday as string) || '{}'), wishlist: wishlist.rows.map((r: any) => r.listingId), purchases: purchases.rows });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/profiles', async (req, res) => {
  try {
    const p = req.body;
    await client.execute({
      sql: `INSERT OR REPLACE INTO profiles (
        address, ympBalance, lastLoginDate, loginStreak, gamesCompletedToday, role, nickname, avatarUrl
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        p.address, p.ympBalance, p.lastLoginDate, p.loginStreak, 
        JSON.stringify(p.gamesCompletedToday || {}), p.role, p.nickname, p.avatarUrl
      ]
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 알림 및 기타 기능
app.get('/api/notifications/:address', async (req, res) => {
  const result = await client.execute({ sql: 'SELECT * FROM notifications WHERE recipientAddress = ? ORDER BY timestamp DESC LIMIT 50', args: [req.params.address] });
  res.json(result.rows.map((n: any) => ({ ...n, isRead: !!n.isRead })));
});

app.post('/api/comments', async (req, res) => {
  const c = req.body;
  await client.execute({ sql: 'INSERT INTO comments (id, listingId, authorAddress, text, timestamp) VALUES (?, ?, ?, ?, ?)', args: [c.id, c.listingId, c.authorAddress, c.text, c.timestamp] });
  res.json({ success: true });
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