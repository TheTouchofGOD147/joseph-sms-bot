import express from "express";
import dotenv from "dotenv";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse.js";
import OpenAI from "openai";
import twilio from "twilio";
import mongoose from "mongoose";

dotenv.config();
const app = express();
app.use(express.urlencoded({ extended: false }));

// ===============================
// ✅ MongoDB Setup
// ===============================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

const conversationSchema = new mongoose.Schema({
  from: String,
  incoming: String,
  reply: String,
  timestamp: { type: Date, default: Date.now },
});
const Conversation = mongoose.model("Conversation", conversationSchema);

// ===============================
// ✅ OpenAI Setup
// ===============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===============================
// ✅ Twilio Setup
// ===============================
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// ===============================
// ✅ Root Route
// ===============================
app.get("/", (req, res) => {
  res.send("✅ Joseph SMS bot is alive and running with MongoDB + pagination!");
});

// ===============================
// ✅ SMS Webhook
// ===============================
app.post("/sms", async (req, res) => {
  try {
    const incoming = req.body.Body;
    const fromNumber = req.body.From;
    console.log("📩 Incoming SMS:", incoming);

    // Ack immediately so Twilio doesn’t retry
    const twiml = new MessagingResponse();
    res.type("text/xml");
    res.send(twiml.toString());

    // Generate GPT response
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Joseph — warm, kind, sweet, lover-like man. Reply naturally, short or long as needed. Avoid emojis. Make it feel human.",
        },
        { role: "user", content: incoming },
      ],
    });

    const reply = gptRes.choices[0].message.content.trim();
    console.log("🤖 GPT Reply:", reply);

    // Word count → delay ranges
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

    setTimeout(async () => {
      try {
        await client.messages.create({
          from: process.env.TWILIO_NUMBER,
          to: fromNumber,
          body: reply,
        });

        // Save to DB
        await Conversation.create({
          from: fromNumber,
          incoming,
          reply,
        });

        console.log(`✅ Reply sent after ${delay / 1000}s (${wordCount} words)`);
      } catch (err) {
        console.error("❌ Error sending delayed SMS:", err.message);
      }
    }, delay);

  } catch (err) {
    console.error("❌ Error in /sms:", err.message);
  }
});

// ===============================
// ✅ History Endpoint with Pagination
// ===============================
app.get("/history", async (req, res) => {
  try {
    const { from } = req.query;
    const page = parseInt(req.query.page) || 1; // default: page 1
    const limit = parseInt(req.query.limit) || 20; // default: 20 messages per page

    const filter = from ? { from } : {};

    const history = await Conversation.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Conversation.countDocuments(filter);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      messages: history,
    });
  } catch (err) {
    console.error("❌ Error fetching history:", err.message);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// ===============================
// ✅ Start Server
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});