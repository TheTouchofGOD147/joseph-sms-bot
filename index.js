import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import twilio from "twilio";
import { MongoClient } from "mongodb";

dotenv.config();
const app = express();
app.use(express.urlencoded({ extended: false }));

// ✅ OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Twilio client
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ MongoDB setup
const mongoClient = new MongoClient(process.env.MONGO_URI);
let conversations;

(async () => {
  try {
    await mongoClient.connect();
    const db = mongoClient.db("joseph_bot"); // database name
    conversations = db.collection("conversations"); // collection name
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
  }
})();

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Joseph SMS bot is alive with long-term memory!");
});

// ✅ Debug route: view chat history
app.get("/history", async (req, res) => {
  try {
    const phone = req.query.phone; // e.g. /history?phone=+14045944455
    const query = phone ? { from: phone } : {};

    const allConvos = await conversations
      .find(query)
      .sort({ timestamp: -1 })
      .limit(50)
      .toArray();

    res.json(allConvos);
  } catch (err) {
    res.status(500).send("❌ Error fetching history");
    console.error("❌ Error fetching history:", err.message);
  }
});

// ✅ Admin route: clear chat history
app.post("/clear-history", async (req, res) => {
  try {
    const key = req.query.key; // pass as ?key=supersecret123
    if (key !== process.env.ADMIN_KEY) {
      return res.status(403).send("❌ Unauthorized");
    }

    const phone = req.query.phone; // optional, clear just one number
    const query = phone ? { from: phone } : {};

    const result = await conversations.deleteMany(query);
    res.send(`🗑️ Cleared ${result.deletedCount} messages`);
  } catch (err) {
    res.status(500).send("❌ Error clearing history");
    console.error("❌ Error clearing history:", err.message);
  }
});

// ✅ Stats route: get bot metrics
app.get("/stats", async (req, res) => {
  try {
    const totalMessages = await conversations.countDocuments({});
    const totalUsers = await conversations.distinct("from");
    const lastMessage = await conversations
      .find({})
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();

    res.json({
      total_messages: totalMessages,
      total_users: totalUsers.length,
      last_active: lastMessage[0]?.timestamp || null,
    });
  } catch (err) {
    res.status(500).send("❌ Error fetching stats");
    console.error("❌ Error fetching stats:", err.message);
  }
});

// ✅ SMS Webhook
app.post("/sms", async (req, res) => {
  try {
    const incoming = req.body.Body;
    const fromNumber = req.body.From;
    console.log("📩 Incoming SMS:", incoming);

    // Ack Twilio instantly
    res.status(200).end();

    // Retrieve last 10 messages from MongoDB
    const history = await conversations
      .find({ from: fromNumber })
      .sort({ timestamp: -1 })
      .limit(10)
      .toArray();

    const context = history
      .reverse() // oldest → newest
      .map((h) => ({
        role: h.role,
        content: h.message,
      }));

    // Call GPT with context
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Joseph — warm, kind, romantic, lover-like, natural. Never robotic. Reply in a human-like way.",
        },
        ...context,
        { role: "user", content: incoming },
      ],
    });

    const reply = gptRes.choices[0].message.content.trim();
    console.log("🤖 Joseph Reply:", reply);

    // Save incoming + reply
    await conversations.insertOne({
      from: fromNumber,
      role: "user",
      message: incoming,
      timestamp: new Date(),
    });
    await conversations.insertOne({
      from: fromNumber,
      role: "assistant",
      message: reply,
      timestamp: new Date(),
    });

    // Pick delay (human-like)
    const wordCount = reply.split(/\s+/).length;
    let min, max;
    if (wordCount < 12) {
      min = 30;
      max = 60;
    } else if (wordCount <= 25) {
      min = 45;
      max = 90;
    } else {
      min = 60;
      max = 120;
    }
    const delay = Math.floor(Math.random() * (max - min + 1) + min) * 1000;

    // Send delayed reply
    setTimeout(async () => {
      try {
        await client.messages.create({
          from: process.env.TWILIO_NUMBER,
          to: fromNumber,
          body: reply,
        });
        console.log(`✅ Sent reply after ${delay / 1000}s`);
      } catch (err) {
        console.error("❌ Error sending SMS:", err.message);
      }
    }, delay);

  } catch (err) {
    console.error("❌ Error in /sms:", err.message);
  }
});

// ✅ Start server
app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
});