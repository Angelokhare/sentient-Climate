import dotenv from "dotenv";
dotenv.config();

import TelegramBot from "node-telegram-bot-api";
import { fireworks } from "@ai-sdk/fireworks";
import { generateObject } from "ai";
import { z } from "zod";

// Environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
const fireworksApiKey = process.env.FIREWORKS_API_KEY;
const baseUrl = process.env.BASE_URL || "https://sentient-climate.vercel.app";

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

// --- Create bot in webhook mode (NO polling) ---
const bot = new TelegramBot(token, { webHook: { port: 443 } });

// Register webhook with Telegram (once per deploy)
bot.setWebHook(`${baseUrl}/api/bot`);

// --- Weather API function ---
async function getWeatherInfo(location, preferences = "") {
try {
const prompt = `
You are Weather Assistant AI. Given the user’s location and preferences,
provide current weather information and helpful recommendations.

Return ONLY valid JSON that matches this shape:
{
"current_weather": {
"location": string,
"current_temp"?: number,
"condition": string,
"humidity"?: number,
"wind_speed"?: number,
"recommendations"?: string[]
},
"forecast"?: [
{"date": string, "high_temp": number, "low_temp": number, "condition": string}
],
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
structuredOutputs: false,
});

return result.object;
} catch (error) {
console.error("Weather API error:", error);
throw error;
}
}

// --- Format weather response ---
function formatWeatherMessage(weatherData) {
const {
current_weather,
forecast,
clothing_suggestions,
activity_recommendations,
} = weatherData;

let message = `🌤️ **Weather for ${current_weather.location}**\n\n`;

// Current
message += `🌡️ **Current Conditions:**\n`;
if (current_weather.current_temp) {
message += `Temperature: ${current_weather.current_temp}°C\n`;
}
message += `Condition: ${current_weather.condition}\n`;

if (current_weather.humidity) {
message += `💧 Humidity: ${current_weather.humidity}%\n`;
}
if (current_weather.wind_speed) {
message += `💨 Wind Speed: ${current_weather.wind_speed} km/h\n`;
}

// Forecast
if (forecast?.length) {
message += `\n📅 **Forecast (next 3 days):**\n`;
forecast.slice(0, 3).forEach((day) => {
message += `${day.date}: ${day.high_temp}°/${day.low_temp}° - ${day.condition}\n`;
});
}

// Clothing
if (clothing_suggestions?.length) {
message += `\n👕 **What to wear:**\n`;
clothing_suggestions.forEach((item) => (message += `• ${item}\n`));
}

// Activities
if (activity_recommendations?.length) {
message += `\n🎯 **Activity suggestions:**\n`;
activity_recommendations.forEach((act) => (message += `• ${act}\n`));
}

// Tips
if (current_weather.recommendations?.length) {
message += `\n💡 **Tips:**\n`;
current_weather.recommendations.forEach((tip) => (message += `• ${tip}\n`));
}

return message;
}

// --- Parse /weather command ---
function parseWeatherCommand(text) {
const cleanText = text.replace(/^\/weather\s*/i, "").trim();
const parts = cleanText.split(/[,;|]/);
const location = parts[0]?.trim() || "";
const preferences = parts.slice(1).join(" ").trim() || "";
return { location, preferences };
}

// --- Bot handlers (same as your version) ---
bot.on("message", async (msg) => {
const chatId = msg.chat.id;
const text = msg.text;

if (!text) return;

try {
if (
text.toLowerCase().startsWith("/weather") ||
text.toLowerCase().includes("weather") ||
text.toLowerCase().startsWith("/w ")
) {
bot.sendChatAction(chatId, "typing");

const { location, preferences } = parseWeatherCommand(text);

if (!location) {
bot.sendMessage(
chatId,
"🌤️ Please provide a location!\n\nExamples:\n• /weather New York\n• /weather London, outdoor activities\n• /weather Tokyo, running"
);
return;
}

try {
const weatherData = await getWeatherInfo(location, preferences);
const formattedMessage = formatWeatherMessage(weatherData);

const buttons = [
[{ text: "🌤 Today", callback_data: `today_${location}` }],
[{ text: "📅 Tomorrow", callback_data: `tomorrow_${location}` }],
[{ text: "🔮 3 Days", callback_data: `3days_${location}` }],
[{ text: "🧥 Clothing Tips", callback_data: `clothes_${location}` }],
[{ text: "🎯 Activities", callback_data: `activities_${location}` }],
[{ text: "📊 Full Forecast", callback_data: `forecast_${location}` }],
];

await bot.sendMessage(chatId, formattedMessage, {
parse_mode: "Markdown",
disable_web_page_preview: true,
reply_markup: { inline_keyboard: buttons },
});
} catch (err) {
bot.sendMessage(
chatId,
"❌ Sorry, I couldn't get weather information right now. Please try again."
);
}
}
} catch (error) {
bot.sendMessage(chatId, "❌ Something went wrong. Please try again.");
}
});

// Button clicks
bot.on("callback_query", async (callbackQuery) => {
const chatId = callbackQuery.message.chat.id;
const data = callbackQuery.data;

await bot.answerCallbackQuery(callbackQuery.id);

const [action, location] = data.split("_");

try {
const weatherData = await getWeatherInfo(location);

if (action === "today") {
const today = weatherData.forecast?.[0];
if (today) {
await bot.sendMessage(
chatId,
`🌤️ *Today's Forecast for ${location}:*\nHigh: ${today.high_temp}°C\nLow: ${today.low_temp}°C\nCondition: ${today.condition}`,
{ parse_mode: "Markdown" }
);
}
} else if (action === "tomorrow") {
const tomorrow = weatherData.forecast?.[1];
if (tomorrow) {
await bot.sendMessage(
chatId,
`📅 *Tomorrow's Forecast for ${location}:*\nHigh: ${tomorrow.high_temp}°C\nLow: ${tomorrow.low_temp}°C\nCondition: ${tomorrow.condition}`,
{ parse_mode: "Markdown" }
);
}
} else if (action === "3days") {
const next3 = weatherData.forecast?.slice(0, 3);
if (next3?.length) {
let msg = `🔮 *3-Day Forecast for ${location}:*\n\n`;
next3.forEach(
(day) =>
(msg += `${day.date}: ${day.high_temp}°/${day.low_temp}° - ${day.condition}\n`)
);
await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}
} else if (action === "clothes") {
if (weatherData.clothing_suggestions?.length) {
let msg = `🧥 *Clothing Tips for ${location}:*\n\n`;
weatherData.clothing_suggestions.forEach(
(item) => (msg += `• ${item}\n`)
);
await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}
} else if (action === "activities") {
if (weatherData.activity_recommendations?.length) {
let msg = `🎯 *Activity Suggestions for ${location}:*\n\n`;
weatherData.activity_recommendations.forEach(
(act) => (msg += `• ${act}\n`)
);
await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}
} else if (action === "forecast") {
if (weatherData.forecast?.length) {
let msg = `📊 *Full Forecast for ${location}:*\n\n`;
weatherData.forecast.forEach(
(day) =>
(msg += `${day.date}: ${day.high_temp}°/${day.low_temp}° - ${day.condition}\n`)
);
await bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
}
}
} catch {
bot.sendMessage(chatId, "❌ Could not fetch info for that option.");
}
});

// Commands
bot.onText(/\/start/, (msg) => {
bot.sendMessage(
msg.chat.id,
"🌤️ **Weather Bot is ready!**\n\nCommands:\n• /weather [location] - Get current weather\n• /weather [location], [preferences] - Get personalized weather info",
{ parse_mode: "Markdown" }
);
});

bot.onText(/\/help/, (msg) => {
bot.sendMessage(
msg.chat.id,
"🌤️ **Weather Bot Help**\n\nExamples:\n• `/weather New York`\n• `/weather London, running`\n• `/weather Tokyo, business casual`",
{ parse_mode: "Markdown" }
);
});

// --- Vercel API handler ---
export default async function handler(req, res) {
if (req.method === "POST") {
bot.processUpdate(req.body);
res.status(200).send("ok");
} else {
res.status(200).send("Weather Bot is running!");
}
}
