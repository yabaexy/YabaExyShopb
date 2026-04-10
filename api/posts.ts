import { db } from "./db";

export default async function handler(req: any, res: any) {
  if (req.method === "GET") {
    const result = await db.execute("SELECT * FROM posts");
    return res.status(200).json(result.rows);
  }

  if (req.method === "POST") {
    const { title, content } = req.body;

    await db.execute({
      sql: "INSERT INTO posts (title, content) VALUES (?, ?)",
      args: [title, content],
    });

    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}