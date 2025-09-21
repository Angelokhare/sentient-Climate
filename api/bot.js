import dotenv from "dotenv";
dotenv.config();

import TelegramBot from "node-telegram-bot-api";
import { fireworks } from "@ai-sdk/fireworks";
import { generateObject } from "ai";
import { z } from "zod";

// --- Env vars ---
const token = process.env.TELEGRAM_BOT_TOKEN;
const fireworksApiKey = process.env.FIREWORKS_API_KEY;
if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!fireworksApiKey) throw new Error("Missing FIREWORKS_API_KEY");

// --- Zod schemas ---
const WeatherInfo = z.object({
  location: z.string().min(1),
  current_temp: z.number().optional(),
  condition: z.string(),
  humidity: z.number().int().min(0).max(100).optional(),
  wind_speed: z.number().nonnegative().optional(),
  recommendations: z.array(z.string()).optional(),
});

const WeatherForecast = z.object({
  date: z.string(),
  high_temp: z.number(),
  low_temp: z.number(),
  condition: z.string(),
});

const Output = z.object({
  current_weather: WeatherInfo,
  forecast: z.array(WeatherForecast).min(1).max(7).optional(),
  clothing_suggestions: z.array(z.string()).optional(),
  activity_recommendations: z.array(z.string()).optional(),
});

// --- Telegram bot in webhook mode ---
const bot = new TelegramBot(token, { webHook: true });

// --- Weather AI function ---
async function getWeatherInfo(location, preferences = "") {
  const prompt = `
You are Weather Assistant AI. Given the user’s location and preferences,
provide current weather information and helpful recommendations.

Return ONLY valid JSON:
{
"current_weather": {...},
"forecast"?: [...],
"clothing_suggestions"?: string[],
"activity_recommendations"?: string[]
}

Location: ${location}
Preferences: ${preferences}
Date: today
`;

  const result = await generateObject({
    model: fireworks(
      "accounts/sentientfoundation/models/dobby-unhinged-llama-3-3-70b-new",
      { apiKey: fireworksApiKey }
    ),
    schema: Output,
    prompt,
  });

  return result.object;
}

// --- Format weather response ---
function formatWeatherMessage(weatherData) {
  const {
    current_weather,
    forecast,
    clothing_suggestions,
    activity_recommendations,
  } = weatherData;

  let message = `🌤️ *Weather for ${current_weather.location}*\n\n`;

  if (current_weather.current_temp)
    message += `🌡️ Temp: ${current_weather.current_temp}°C\n`;
  message += `Condition: ${current_weather.condition}\n`;

  if (current_weather.humidity)
    message += `💧 Humidity: ${current_weather.humidity}%\n`;
  if (current_weather.wind_speed)
    message += `💨 Wind: ${current_weather.wind_speed} km/h\n`;

  if (forecast?.length) {
    message += `\n📅 *Forecast (next 3 days):*\n`;
    forecast.slice(0, 3).forEach((day) => {
      message += `${day.date}: ${day.high_temp}°/${day.low_temp}° - ${day.condition}\n`;
    });
  }

  if (clothing_suggestions?.length) {
    message += `\n👕 *What to wear:*\n${clothing_suggestions.map((i) => `• ${i}`).join("\n")}\n`;
  }

  if (activity_recommendations?.length) {
    message += `\n🎯 *Activities:*\n${activity_recommendations.map((a) => `• ${a}`).join("\n")}\n`;
  }

  if (current_weather.recommendations?.length) {
    message += `\n💡 *Tips:*\n${current_weather.recommendations.map((t) => `• ${t}`).join("\n")}\n`;
  }

  return message;
}

// --- Parse /weather ---
function parseWeatherCommand(text) {
  const cleanText = text.replace(/^\/weather\s*/i, "").trim();
  const parts = cleanText.split(/[,;|]/);
  const location = parts[0]?.trim() || "";
  const preferences = parts.slice(1).join(" ").trim() || "";
  return { location, preferences };
}

// --- Handlers ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  if (/^\/weather|weather|^\/w\s/i.test(text)) {
    const { location, preferences } = parseWeatherCommand(text);
    if (!location) {
      return bot.sendMessage(
        chatId,
        "🌤️ Please provide a location!\nExample:\n/weather London, running"
      );
    }
    try {
      bot.sendChatAction(chatId, "typing");
      const weatherData = await getWeatherInfo(location, preferences);
      const formatted = formatWeatherMessage(weatherData);
      await bot.sendMessage(chatId, formatted, { parse_mode: "Markdown" });
    } catch {
      bot.sendMessage(chatId, "❌ Could not fetch weather info.");
    }
  }
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "🌤️ *Weather Bot ready!*\nUse `/weather [location]`",
    { parse_mode: "Markdown" }
  );
});

// --- Vercel handler ---
export default async function handler(req, res) {
  if (req.method === "POST") {
    bot.processUpdate(req.body);
    return res.status(200).send("ok");
  }
  res.status(200).send("Weather Bot is running!");
}