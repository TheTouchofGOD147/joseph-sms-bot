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
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const messageSchema = new mongoose.Schema({
  from: String,
  incoming: String,
  reply: String,
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model("Message", messageSchema);

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
  res.send("✅ Joseph SMS bot is alive and stable v1.0!");
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
            "You are Joseph — warm, kind, sweet lover-like man. Always human, never robotic. Reply naturally.",
        },
        { role: "user", content: incoming },
      ],
    });

    const reply = gptRes.choices[0].message.content.trim();
    console.log("🤖 GPT Reply:", reply);

    // Save to MongoDB
    const log = new Message({
      from: fromNumber,
      incoming,
      reply,
    });
    await log.save();
    console.log("🗄️ Conversation logged in MongoDB");

    // Word count → delay ranges
    const wordCount = reply.split(/\s+/).length;
    let min, max;
    if (wordCount < 12) {
      min = 30; max = 60;
    } else if (wordCount <= 25) {
      min = 45; max = 90;
    } else {
      min = 60; max = 120;
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
        console.error("❌ Error sending delayed SMS:", err.message);
      }
    }, delay);

  } catch (err) {
    console.error("❌ Error in /sms:", err.message);
  }
});

// ===============================
// ✅ Start Server
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});