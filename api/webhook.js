import { bot } from "../bot"; // your bot logic in a separate file

export default async function handler(req, res) {
  if (req.method === "POST") {
    bot.processUpdate(req.body); // let telegram handle update
    return res.status(200).send("OK");
  }
  res.status(200).send("Hello from Weather Bot");
}