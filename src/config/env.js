const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const defaultEnvPath = path.resolve(process.cwd(), ".env");
const customEnvPath = process.env.ENV_FILE
  ? path.isAbsolute(process.env.ENV_FILE)
    ? process.env.ENV_FILE
    : path.resolve(process.cwd(), process.env.ENV_FILE)
  : null;
const envPath = customEnvPath && fs.existsSync(customEnvPath)
  ? customEnvPath
  : defaultEnvPath;

dotenv.config({ path: envPath });

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  databaseName: process.env.DATABASE_NAME || "lh_order_tiktok_helper",
};

module.exports = env;
