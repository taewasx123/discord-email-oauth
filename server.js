import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const app = express();

// Railway/Render gibi hostlar PORT verir
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// Basit JSON “DB”
const DATA_DIR = process.env.DATA_DIR || "."; // hostta volume bağlarsan /data gibi yapacağız
const DB_PATH = path.join(DATA_DIR, "emails.json");

function ensureDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, "[]", "utf8");
  } catch (e) {
    // volume yoksa bazı hostlarda yazma izni olmayabilir
    console.error("DB init error:", e);
  }
}

function readDB() {
  ensureDB();
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeDB(arr) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(arr, null, 2), "utf8");
  } catch (e) {
    console.error("DB write error:", e);
  }
}

function upsertEmail({ discordId, email, verified }) {
  const db = readDB();
  const now = new Date().toISOString();

  const idx = db.findIndex((x) => x.discordId === discordId);
  const record = { discordId, email, verified: !!verified, updatedAt: now };

  if (idx === -1) db.push({ ...record, createdAt: now });
  else db[idx] = { ...db[idx], ...record };

  writeDB(db);
}

const qs = (obj) => new URLSearchParams(obj).toString();

app.get("/", (req, res) => res.send("OK. /verify"));

app.get("/verify", (req, res) => {
  // istersen state ile discord userId eşlemesi yaparsın:
  // /verify?state=123
  const state = req.query.state ?? "test";

  const url =
    "https://discord.com/api/oauth2/authorize?" +
    qs({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify email",
      state,
    });

  res.redirect(url);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code) return res.status(400).send("No code");

  // code -> token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const token = await tokenRes.json();
  if (!token.access_token) return res.status(400).send("Token error: " + JSON.stringify(token));

  // token -> user (email burada)
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  const user = await userRes.json();

  // ✅ JSON’a kaydet
  upsertEmail({
    discordId: user.id,
    email: user.email,
    verified: user.verified,
  });

  res.send(
    `Saved ✅\nDiscord ID: ${user.id}\nEmail: ${user.email}\nVerified: ${user.verified}\nState: ${state}\n`
  );
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server: http://localhost:${PORT}`));
