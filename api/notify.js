const admin = require("firebase-admin");

function loadServiceAccount() {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var missing");
  raw = raw.trim();
  // Quotes me wrap ho gaya ho to hata do
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"') && raw[1] !== "{")) {
    raw = raw.slice(1, -1);
  }
  // Base64 encoded JSON bhi chalega
  if (!raw.startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(raw);
  // Env var me private_key ke "\\n" ko asli newline banao
  if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

let initError = null;
if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
  } catch (e) {
    initError = e.message;
  }
}

module.exports = async (req, res) => {
  if (initError) {
    return res.status(500).json({ success: false, error: "Service account config error: " + initError });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { sender, messageText, zamirToken, rahimaToken } = req.body || {};

  let recipientToken, title;
  if (sender === "Zamir") {
    recipientToken = rahimaToken;
    title = "💬 Message from Zamir";
  } else if (sender === "Rahima") {
    recipientToken = zamirToken;
    title = "💬 Message from Rahima";
  } else {
    return res.status(400).json({ error: "Invalid Sender" });
  }

  if (!recipientToken) {
    return res.status(200).json({ success: false, skipped: "Recipient token not registered yet" });
  }

  const body = String(messageText || "New message").slice(0, 150);

  try {
    const response = await admin.messaging().send({
      token: recipientToken,
      notification: { title, body },
      webpush: { fcmOptions: { link: "/" } }
    });
    return res.status(200).json({ success: true, response });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
