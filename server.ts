import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@libsql/client';
import geoip from 'geoip-lite';
import requestIp from 'request-ip';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = createClient({
  // Vercel이 자동으로 넣어주는 환경 변수 이름을 사용합니다. 
  // 보통 TURSO_DATABASE_URL 또는 LIBSQL_URL 같은 이름입니다.
  url: process.env.libsql://database-bistre-garden-vercel-icfg-kqt2ce1zvk7qrfygbdevgcfg.aws-ap-northeast-1.turso.io || process.env.LIBSQL_URL || 'file:exyon.db',
  authToken: process.env.eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NzU2NTQ1NzEsImlkIjoiMDE5ZDZkNDItOGQwMS03ZmVkLWEzYjgtZDQ1NGRjZGU1OTczIiwicmlkIjoiOTg5MzY4MDQtMzRjNS00ZGFiLTg5ZTEtODBjMDg5YTg0Y2MxIn0.tCxaxRdnR6ECXTZSQqvJShEjzfYrr9llqOHr7kxMtAs3i8bfH0BX8JHhEO-6eScEOnxtFU4Heqs4s_rjWxSVDA || process.env.LIBSQL_AUTH_TOKEN,
});
// Initialize Database
async function initDb() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      price REAL,
      imageUrl TEXT,
      seller TEXT,
      createdAt INTEGER,
      views INTEGER DEFAULT 0,
      sales INTEGER DEFAULT 0,
      category TEXT,
      isDigital INTEGER DEFAULT 0,
      downloadUrl TEXT,
      allowBidding INTEGER DEFAULT 0,
      allowCustomOrder INTEGER DEFAULT 0,
      highestBid REAL,
      highestBidder TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      address TEXT PRIMARY KEY,
      ympBalance INTEGER DEFAULT 0,
      lastLoginDate TEXT,
      loginStreak INTEGER DEFAULT 0,
      gamesCompletedToday TEXT,
      lastGameRewardDate TEXT,
      role TEXT DEFAULT 'user',
      nickname TEXT,
      avatarUrl TEXT,
      followersCount INTEGER DEFAULT 0,
      followingCount INTEGER DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS followers (
      followerAddress TEXT,
      followingAddress TEXT,
      PRIMARY KEY (followerAddress, followingAddress)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS wishlist (
      address TEXT,
      listingId TEXT,
      PRIMARY KEY (address, listingId)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipientAddress TEXT,
      senderAddress TEXT,
      type TEXT, -- 'comment', 'bid', 'follow', 'purchase'
      listingId TEXT,
      message TEXT,
      isRead INTEGER DEFAULT 0,
      timestamp INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      listingId TEXT,
      title TEXT,
      price REAL,
      date INTEGER,
      category TEXT,
      isDigital INTEGER DEFAULT 0,
      downloadUrl TEXT,
      buyerAddress TEXT,
      sellerAddress TEXT,
      status TEXT DEFAULT 'escrow_pending'
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      listingId TEXT,
      authorAddress TEXT,
      text TEXT,
      timestamp INTEGER
    );
  `);
}

async function startServer() {
  await initDb();
  const app = express();
  app.use(cors()); // 모든 도메인에서의 요청을 허용 (지갑/AI Studio 연동 필수)
  app.use(express.json());
  const PORT = 3000;

  app.use(express.json());
  app.use(requestIp.mw());

  // IP Blocking Middleware
  const BLOCKED_COUNTRIES = ['CN', 'RU', 'BY', 'CU', 'HK', 'MO', 'KP', 'IR'];
  
  app.use((req, res, next) => {
    const ip = req.clientIp;
    if (ip) {
      const geo = geoip.lookup(ip);
      if (geo && BLOCKED_COUNTRIES.includes(geo.country)) {
        return res.status(403).send('Access Denied: Your region is restricted.');
      }
    }
    next();
  });

  // Helper to create notifications
  const createNotification = async (recipient: string, sender: string, type: string, message: string, listingId?: string) => {
    if (recipient.toLowerCase() === sender.toLowerCase()) return; // Don't notify self
    const id = Math.random().toString(36).substr(2, 9);
    await client.execute({
      sql: 'INSERT INTO notifications (id, recipientAddress, senderAddress, type, message, listingId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [id, recipient, sender, type, message, listingId || null, Date.now()]
    });
  };

  // API Routes
  app.get('/api/geo', (req, res) => {
    const ip = req.clientIp;
    const geo = geoip.lookup(ip || '');
    res.json({ country: geo ? geo.country : 'Unknown' });
  });

  app.get('/api/listings', async (req, res) => {
    const { q } = req.query;
    let result;
    if (q) {
      result = await client.execute({
        sql: 'SELECT * FROM listings WHERE title LIKE ? OR description LIKE ? ORDER BY createdAt DESC',
        args: [`%${q}%`, `%${q}%`]
      });
    } else {
      result = await client.execute('SELECT * FROM listings ORDER BY createdAt DESC');
    }
    res.json(result.rows.map((l: any) => ({
      ...l,
      isDigital: !!l.isDigital,
      allowBidding: !!l.allowBidding,
      allowCustomOrder: !!l.allowCustomOrder
    })));
  });

  app.get('/api/profiles', async (req, res) => {
    const { q } = req.query;
    let result;
    if (q) {
      result = await client.execute({
        sql: 'SELECT * FROM profiles WHERE address LIKE ? ORDER BY address ASC',
        args: [`%${q}%`]
      });
    } else {
      result = await client.execute('SELECT * FROM profiles ORDER BY address ASC');
    }
    res.json(result.rows);
  });

  app.post('/api/listings', async (req, res) => {
    const listing = req.body;
    const existingResult = await client.execute({
      sql: 'SELECT * FROM listings WHERE id = ?',
      args: [listing.id]
    });
    const existing = existingResult.rows[0];

    if (existing) {
      if ((existing.seller as string).toLowerCase() !== listing.seller.toLowerCase()) {
        return res.status(403).json({ error: 'Only the seller can update this listing' });
      }
      await client.execute({
        sql: `UPDATE listings SET title = ?, description = ?, price = ?, category = ?, isDigital = ?, downloadUrl = ?, allowBidding = ?, allowCustomOrder = ?
              WHERE id = ?`,
        args: [
          listing.title, listing.description, listing.price, listing.category, 
          listing.isDigital ? 1 : 0,
          listing.downloadUrl, listing.allowBidding ? 1 : 0, listing.allowCustomOrder ? 1 : 0,
          listing.id
        ]
      });
    } else {
      await client.execute({
        sql: `INSERT INTO listings (id, title, description, price, imageUrl, seller, createdAt, views, sales, category, isDigital, downloadUrl, allowBidding, allowCustomOrder)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          listing.id, listing.title, listing.description, listing.price, 
          listing.imageUrl, listing.seller, listing.createdAt, 
          listing.views || 0, listing.sales || 0, listing.category, 
          listing.isDigital ? 1 : 0,
          listing.downloadUrl, listing.allowBidding ? 1 : 0, listing.allowCustomOrder ? 1 : 0
        ]
      });
    }
    res.json({ success: true });
  });

  app.post('/api/listings/:id/view', async (req, res) => {
    await client.execute({
      sql: 'UPDATE listings SET views = views + 1 WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  });

  app.post('/api/listings/:id/bid', async (req, res) => {
    const { amount, bidder } = req.body;
    const listingResult = await client.execute({
      sql: 'SELECT * FROM listings WHERE id = ?',
      args: [req.params.id]
    });
    const listing = listingResult.rows[0];

    if (listing) {
      await createNotification(listing.seller as string, bidder, 'bid', `New bid of ${amount} WYDA on your item: ${listing.title}`, listing.id as string);
      if (listing.highestBidder && (listing.highestBidder as string).toLowerCase() !== bidder.toLowerCase()) {
        await createNotification(listing.highestBidder as string, bidder, 'bid', `You've been outbid on ${listing.title}. New bid: ${amount} WYDA`, listing.id as string);
      }
    }
    await client.execute({
      sql: 'UPDATE listings SET highestBid = ?, highestBidder = ? WHERE id = ?',
      args: [amount, bidder, req.params.id]
    });
    res.json({ success: true });
  });

  app.get('/api/profiles/:address', async (req, res) => {
    const profileResult = await client.execute({
      sql: 'SELECT * FROM profiles WHERE address = ?',
      args: [req.params.address]
    });
    const profile = profileResult.rows[0];

    if (profile) {
      const wishlistResult = await client.execute({
        sql: 'SELECT listingId FROM wishlist WHERE address = ?',
        args: [req.params.address]
      });
      const followingResult = await client.execute({
        sql: 'SELECT followingAddress FROM followers WHERE followerAddress = ?',
        args: [req.params.address]
      });
      const purchasesResult = await client.execute({
        sql: 'SELECT * FROM purchases WHERE buyerAddress = ? ORDER BY date DESC',
        args: [req.params.address]
      });

      res.json({
        ...profile,
        gamesCompletedToday: JSON.parse((profile.gamesCompletedToday as string) || '{}'),
        purchases: purchasesResult.rows,
        wishlist: wishlistResult.rows.map((row: any) => row.listingId),
        following: followingResult.rows.map((row: any) => row.followingAddress)
      });
    } else {
      res.status(404).json({ error: 'Profile not found' });
    }
  });

  app.post('/api/profiles', async (req, res) => {
    const profile = req.body;
    await client.execute({
      sql: `INSERT OR REPLACE INTO profiles (address, ympBalance, lastLoginDate, loginStreak, gamesCompletedToday, lastGameRewardDate, role, nickname, avatarUrl, followersCount, followingCount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        profile.address, profile.ympBalance, profile.lastLoginDate, 
        profile.loginStreak, JSON.stringify(profile.gamesCompletedToday), 
        profile.lastGameRewardDate, profile.role, profile.nickname || null, profile.avatarUrl || null,
        profile.followersCount || 0, profile.followingCount || 0
      ]
    });
    res.json({ success: true });
  });

  app.post('/api/profiles/:address/follow', async (req, res) => {
    const { followerAddress } = req.body;
    const followingAddress = req.params.address;
    try {
      await client.execute({
        sql: 'INSERT INTO followers (followerAddress, followingAddress) VALUES (?, ?)',
        args: [followerAddress, followingAddress]
      });
      await client.execute({
        sql: 'UPDATE profiles SET followersCount = followersCount + 1 WHERE address = ?',
        args: [followingAddress]
      });
      await client.execute({
        sql: 'UPDATE profiles SET followingCount = followingCount + 1 WHERE address = ?',
        args: [followerAddress]
      });
      await createNotification(followingAddress, followerAddress, 'follow', `You have a new follower!`);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Already following' });
    }
  });

  app.post('/api/profiles/:address/unfollow', async (req, res) => {
    const { followerAddress } = req.body;
    const followingAddress = req.params.address;
    const result = await client.execute({
      sql: 'DELETE FROM followers WHERE followerAddress = ? AND followingAddress = ?',
      args: [followerAddress, followingAddress]
    });
    if (result.rowsAffected > 0) {
      await client.execute({
        sql: 'UPDATE profiles SET followersCount = followersCount - 1 WHERE address = ?',
        args: [followingAddress]
      });
      await client.execute({
        sql: 'UPDATE profiles SET followingCount = followingCount - 1 WHERE address = ?',
        args: [followerAddress]
      });
    }
    res.json({ success: true });
  });

  app.post('/api/listings/:id/wishlist', async (req, res) => {
    const { address } = req.body;
    const listingId = req.params.id;
    try {
      await client.execute({
        sql: 'INSERT INTO wishlist (address, listingId) VALUES (?, ?)',
        args: [address, listingId]
      });
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Already in wishlist' });
    }
  });

  app.post('/api/listings/:id/unwishlist', async (req, res) => {
    const { address } = req.body;
    const listingId = req.params.id;
    await client.execute({
      sql: 'DELETE FROM wishlist WHERE address = ? AND listingId = ?',
      args: [address, listingId]
    });
    res.json({ success: true });
  });

  app.post('/api/purchases', async (req, res) => {
    const { purchase, buyerAddress } = req.body;
    const listingResult = await client.execute({
      sql: 'SELECT * FROM listings WHERE id = ?',
      args: [purchase.listingId]
    });
    const listing = listingResult.rows[0];

    if (listing) {
      await createNotification(listing.seller as string, buyerAddress, 'purchase', `Your item "${listing.title}" has been purchased for ${listing.price} WYDA!`, listing.id as string);
    }
    await client.execute({
      sql: `INSERT INTO purchases (id, listingId, title, price, date, category, isDigital, downloadUrl, buyerAddress, sellerAddress, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        purchase.id, purchase.listingId, purchase.title, purchase.price, 
        purchase.date, purchase.category, purchase.isDigital ? 1 : 0, purchase.downloadUrl, buyerAddress,
        listing ? listing.seller : null, 'escrow_pending'
      ]
    });
    await client.execute({
      sql: 'DELETE FROM listings WHERE id = ?',
      args: [purchase.listingId]
    });
    res.json({ success: true });
  });

  app.get('/api/comments/:listingId', async (req, res) => {
    const result = await client.execute({
      sql: 'SELECT * FROM comments WHERE listingId = ? ORDER BY timestamp DESC',
      args: [req.params.listingId]
    });
    res.json(result.rows);
  });

  app.post('/api/comments', async (req, res) => {
    const comment = req.body;
    const listingResult = await client.execute({
      sql: 'SELECT * FROM listings WHERE id = ?',
      args: [comment.listingId]
    });
    const listing = listingResult.rows[0];

    if (listing) {
      await createNotification(listing.seller as string, comment.authorAddress, 'comment', `New comment on your item: ${listing.title}`, listing.id as string);
    }
    await client.execute({
      sql: 'INSERT INTO comments (id, listingId, authorAddress, text, timestamp) VALUES (?, ?, ?, ?, ?)',
      args: [comment.id, comment.listingId, comment.authorAddress, comment.text, comment.timestamp]
    });
    res.json({ success: true });
  });

  app.get('/api/notifications/:address', async (req, res) => {
    const result = await client.execute({
      sql: 'SELECT * FROM notifications WHERE recipientAddress = ? ORDER BY timestamp DESC LIMIT 50',
      args: [req.params.address]
    });
    res.json(result.rows.map((n: any) => ({ ...n, isRead: !!n.isRead })));
  });

  app.post('/api/notifications/:id/read', async (req, res) => {
    await client.execute({
      sql: 'UPDATE notifications SET isRead = 1 WHERE id = ?',
      args: [req.params.id]
    });
    res.json({ success: true });
  });

  app.post('/api/notifications/read-all', async (req, res) => {
    const { address } = req.body;
    await client.execute({
      sql: 'UPDATE notifications SET isRead = 1 WHERE recipientAddress = ?',
      args: [address]
    });
    res.json({ success: true });
  });

  // Admin Escrow Endpoints
  app.get('/api/admin/escrow', async (req, res) => {
    const result = await client.execute('SELECT * FROM purchases ORDER BY date DESC');
    res.json(result.rows);
  });

  app.post('/api/admin/escrow/:id/status', async (req, res) => {
    const { status } = req.body;
    await client.execute({
      sql: 'UPDATE purchases SET status = ? WHERE id = ?',
      args: [status, req.params.id]
    });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

// 로컬 테스트 환경(내 컴퓨터)에서만 listen이 실행되도록 조건문을 겁니다.
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// ⭐️ 가장 중요한 추가 사항: Vercel이 이 Express 설정을 가져다 쓸 수 있게 내보냅니다.
export default app;
app.use(cors());
}

startServer();
