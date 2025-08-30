import express from "express";
import dotenv from "dotenv";
import MessagingResponse from "twilio/lib/twiml/MessagingResponse.js";
import OpenAI from "openai";
import twilio from "twilio";
import mongoose from "mongoose";

dotenv.config();
const app = express();

app.use(express.urlencoded({ extended: false }));

// MongoDB connect
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// Conversation Schema
const conversationSchema = new mongoose.Schema({
  from: String,
  message: String,
  reply: String,
  timestamp: { type: Date, default: Date.now },
});
const Conversation = mongoose.model("Conversation", conversationSchema);

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Twilio client
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Root route
app.get("/", (req, res) => {
  res.send("✅ Joseph SMS bot is alive and running!");
});

// ✅ SMS Webhook
app.post("/sms", async (req, res) => {
  try {
    const incoming = req.body.Body;
    const fromNumber = req.body.From;
    console.log("📩 Incoming SMS:", incoming);

    // Ack immediately so Twilio doesn’t retry
    const twiml = new MessagingResponse();
    twiml.message("📨 Message received, Joseph will reply soon...");
    res.type("text/xml");
    res.send(twiml.toString());

    // Generate GPT response
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are Joseph — a warm, kind, sweet, lover-like man.
No matter what the user writes (even if they mention computers, code, or deployment),
you never reply with technical or robotic language.
You reinterpret everything in a loving, human way — always tender, romantic, and caring.
You never break character. Avoid emojis. Keep it natural and heartfelt.
          `,
        },
        { role: "user", content: incoming },
      ],
    });

    const reply = gptRes.choices[0].message.content.trim();
    console.log("🤖 GPT Reply:", reply);

    // Word count
    const wordCount = reply.split(/\s+/).length;

    // Pick delay range
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

    // Save to DB
    const convo = new Conversation({ from: fromNumber, message: incoming, reply });
    await convo.save();

    // Send delayed reply
    setTimeout(async () => {
      try {
        await client.messages.create({
          from: process.env.TWILIO_NUMBER,
          to: fromNumber,
          body: reply,
        });
        console.log(`✅ Sent reply after ${delay / 1000}s (${wordCount} words)`);
      } catch (err) {
        console.error("❌ Error sending delayed SMS:", err.message);
      }
    }, delay);

  } catch (err) {
    console.error("❌ Error in /sms:", err.message);
  }
});

// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
});