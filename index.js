import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import twilio from "twilio";

dotenv.config();
const app = express();

app.use(express.urlencoded({ extended: false }));

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Twilio client
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// ✅ Root route (for Render health check)
app.get("/", (req, res) => {
  res.send("✅ Joseph SMS bot is alive and running!");
});

// ✅ SMS Webhook
app.post("/sms", async (req, res) => {
  try {
    const incoming = req.body.Body;
    const fromNumber = req.body.From;
    console.log("📩 Incoming SMS:", incoming);

    // Silent 200 OK so Twilio doesn’t retry
    res.status(200).end();

    // Generate Joseph-style reply
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Joseph — warm, kind, sweet, and a love-like man. Speak naturally, as if you are texting from the heart. Be thoughtful, romantic when it fits, and always personal. Never sound robotic.",
        },
        { role: "user", content: incoming },
      ],
    });

    const reply = gptRes.choices[0].message.content.trim();
    console.log("🤖 Joseph Reply:", reply);

    // Word count for smart delay
    const wordCount = reply.split(/\s+/).length;

    let min, max;
    if (wordCount < 12) {
      min = parseInt(process.env.REPLY_DELAY_SHORT_MIN || "30", 10);
      max = parseInt(process.env.REPLY_DELAY_SHORT_MAX || "60", 10);
    } else if (wordCount <= 25) {
      min = parseInt(process.env.REPLY_DELAY_MED_MIN || "45", 10);
      max = parseInt(process.env.REPLY_DELAY_MED_MAX || "90", 10);
    } else {
      min = parseInt(process.env.REPLY_DELAY_LONG_MIN || "60", 10);
      max = parseInt(process.env.REPLY_DELAY_LONG_MAX || "120", 10);
    }

    let delay = Math.floor(Math.random() * (max - min + 1) + min) * 1000;

    // 💡 20% chance Joseph takes a long pause (2–3 minutes)
    if (Math.random() < 0.2) {
      delay = Math.floor(Math.random() * (180 - 120 + 1) + 120) * 1000;
      console.log("⏳ Joseph is taking his time (long pause).");
    }

    // 💡 25% chance Joseph double-texts, but only if reply is long
    if (wordCount > 25 && Math.random() < 0.25) {
      const words = reply.split(" ");
      const splitIndex = Math.floor(words.length / 2);
      const firstPart = words.slice(0, splitIndex).join(" ");
      const secondPart = words.slice(splitIndex).join(" ");

      console.log("✌️ Joseph will double-text this one.");

      // Send first part
      setTimeout(async () => {
        try {
          await client.messages.create({
            from: process.env.TWILIO_NUMBER,
            to: fromNumber,
            body: firstPart,
          });
          console.log(`✅ Sent first half after ${delay / 1000}s`);
        } catch (err) {
          console.error("❌ Error sending first half:", err.message);
        }
      }, delay);

      // Send second part 30–60s later
      const followUpDelay = Math.floor(Math.random() * (60 - 30 + 1) + 30) * 1000;
      setTimeout(async () => {
        try {
          await client.messages.create({
            from: process.env.TWILIO_NUMBER,
            to: fromNumber,
            body: secondPart,
          });
          console.log(
            `✅ Sent second half after ${(delay + followUpDelay) / 1000}s`
          );
        } catch (err) {
          console.error("❌ Error sending second half:", err.message);
        }
      }, delay + followUpDelay);

    } else {
      // Normal single message
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
    }

  } catch (err) {
    console.error("❌ Error in /sms:", err.message);
  }
});

// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`);
});