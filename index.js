import "dotenv/config";  // loads .env
import "./bot.js";       // starts your Telegram bot
import express from "express";

const app = express();

app.get("/", (req, res) => res.send("Bot is running"));

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`);
});