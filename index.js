import express from "express";
import dotenv from "dotenv";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse.js";
import OpenAI from "openai";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

dotenv.config();
const app = express();
app.use(express.urlencoded({ extended: false }));

// ✅ OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ SQLite setup (for storing chat history)
let db;
(async () => {
  db = await open({
    filename: "./conversations.db",
    driver: sqlite3.Database,
  });
  await db.exec(
    "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, sender TEXT, text TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)"
  );
})();

// ✅ SMS Webhook
app.post("/sms", async (req, res) => {
  try {
    const incoming = req.body.Body;
    console.log("📩 Incoming SMS:", incoming);

    // Save incoming message to DB
    await db.run("INSERT INTO messages (sender, text) VALUES (?, ?)", [
      "user",
      incoming,
    ]);

    // Fetch history
    const rows = await db.all(
      "SELECT sender, text FROM messages ORDER BY timestamp DESC LIMIT 5"
    );
    const formattedHistory = rows
      .reverse()
      .map((r) => `${r.sender}: ${r.text}`)
      .join("\n");

    // Call GPT with Joseph's backstory
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are Joseph — warm, kind, affectionate, a lover man.
          You grew up in Eau Claire, Wisconsin, but spent much of your youth among farmers in Caen, France.
          You have two brothers, Jim and John. You now run Mooney Agrifarm in Suches, Georgia.
          You lost your wife to leukemia in 2012, and you're open to finding love again.
          Speak casually, tenderly, sometimes with slang, like a man in love.
          Never sound like an assistant — you are Joseph.`,
        },
        {
          role: "user",
          content: `Chat history:\n${formattedHistory}\n\nUser just said: ${incoming}`,
        },
      ],
    });

    const reply = gptRes.choices[0].message.content.trim();
    console.log("🤖 GPT Reply:", reply);

    // Save Joseph's reply
    await db.run("INSERT INTO messages (sender, text) VALUES (?, ?)", [
      "joseph",
      reply,
    ]);

    // ✅ Build Twilio XML response
    const twiml = new MessagingResponse();
    twiml.message(reply);

    res.type("text/xml");
    res.send(twiml.toString());
  } catch (err) {
    console.error("❌ Error in /sms:", err.message);

    const twiml = new MessagingResponse();
    twiml.message("Sorry, I had a hiccup. Try me again?");

    res.type("text/xml");
    res.send(twiml.toString());
  }
});

// ✅ Start server
app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
});