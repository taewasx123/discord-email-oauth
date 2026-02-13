import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const FILE_PATH = "emails.json";

// github dosyasını oku
async function getFile() {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
  });

  if (res.status === 404) return { sha: null, data: [] };

  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, "base64").toString());
  return { sha: json.sha, data: content };
}

// github dosyasına yaz
async function saveFile(newData) {
  const { sha } = await getFile();

  await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: "update emails",
      content: Buffer.from(JSON.stringify(newData, null, 2)).toString("base64"),
      sha: sha || undefined
    })
  });
}

const qs = (obj) => new URLSearchParams(obj).toString();

app.get("/", (req, res) => res.send("OK /verify"));

app.get("/verify", (req, res) => {
  const url =
    "https://discord.com/api/oauth2/authorize?" +
    qs({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify email"
    });

  res.redirect(url);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code");

  // token al
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: qs({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    })
  });

  const token = await tokenRes.json();

  // user al
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });

  const user = await userRes.json();

  // eski veriyi çek
  const { data } = await getFile();

  // ekle / güncelle
  const existing = data.find(x => x.discordId === user.id);
  if (existing) {
    existing.email = user.email;
    existing.verified = user.verified;
    existing.updatedAt = new Date().toISOString();
  } else {
    data.push({
      discordId: user.id,
      email: user.email,
      verified: user.verified,
      createdAt: new Date().toISOString()
    });
  }

  await saveFile(data);

  res.redirect("https://discord.gg/laliga");
});

app.listen(PORT, () => console.log("Server started"));
