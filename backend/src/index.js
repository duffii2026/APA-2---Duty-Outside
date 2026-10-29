// The default local configuration lives in .env (APA 2).
require("dotenv").config({ path: process.env.ENV_FILE || ".env", quiet: true });

const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const pool = require("./db");
const { startPoller } = require("./telegramService");

const app = express();
const PORT = Number(process.env.PORT) || 5005;
const APP_NAME = String(process.env.APP_NAME || "APA 2 - Duty Outside").trim();

// Keep req.ip meaningful (and the per-IP limits per person) when a reverse proxy
// sits in front of the API. Only enabled deliberately — see clientIp in routes.
if (String(process.env.TRUST_PROXY || "").trim()) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

// Origins allowed to call the API with cookies.
const BASE_ORIGINS = [
  // APA 2: duty-outside.apa2-eva.com, frontend 4326, API 5005.
  "https://duty-outside.apa2-eva.com",
  "http://duty-outside.apa2-eva.com",
  "https://dutyoutsideapi.apa2-eva.com",
  "http://dutyoutsideapi.apa2-eva.com",
  "http://localhost:4326",
  "https://localhost:4326",

  // Telegram webhook / bot callbacks.
  "https://api.telegram.org",
];

const extraOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...BASE_ORIGINS, ...extraOrigins])];

app.use(cors({
  // Allow anything when nothing is configured at all, matching the old behaviour.
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error("[fatal]", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[api] ${APP_NAME} listening on http://localhost:${PORT}`);
  console.log(`[api] allowed origins: ${allowedOrigins.length ? allowedOrigins.join(", ") : "any"}`);
  // Confirms the database is reachable and prints which one was used.
  pool.verifyConnection();
  startPoller();
});
