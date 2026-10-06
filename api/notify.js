const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

module.exports = async (req, res) => {
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
