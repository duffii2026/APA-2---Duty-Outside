const mysql = require("mysql2/promise");
// Fall back to .env only when no env file was passed on the command line.
// See --env-file=.env1 / --env-file=.env2 in package.json.
require("dotenv").config({ path: process.env.ENV_FILE || ".env", quiet: true });

const DB_CONFIG = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "apa2_duty_outside",
};

const pool = mysql.createPool({
  ...DB_CONFIG,
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4_unicode_ci",
  dateStrings: true,
});

// Never include the password in logs.
const describeTarget = () =>
  `mysql://${DB_CONFIG.user}@${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`;

/**
 * Opens one connection at startup so the console shows which database was
 * actually reached (and whether it is reachable at all) before the first
 * request arrives. Logs only — a failure here does not stop the API from
 * starting, the individual queries report their own errors.
 */
const verifyConnection = async () => {
  const startedAt = Date.now();
  console.log(`[db] connecting -> ${describeTarget()}`);

  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(
      "SELECT VERSION() AS version, @@hostname AS serverHost, DATABASE() AS schemaName"
    );
    const info = rows[0] || {};
    console.log(
      `[db] connected in ${Date.now() - startedAt}ms -> ${describeTarget()}` +
        `\n[db] server ${info.serverHost} · mysql ${info.version} · schema ${info.schemaName}`
    );
  } catch (err) {
    console.error(
      `[db] FAILED after ${Date.now() - startedAt}ms -> ${describeTarget()}` +
        `\n[db] ${err.code || "ERROR"}: ${err.message}`
    );
  } finally {
    if (connection) connection.release();
  }
};

module.exports = pool;
module.exports.verifyConnection = verifyConnection;
