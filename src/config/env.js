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
  port: Number(process.env.PORT || 6600),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  databaseName: process.env.DATABASE_NAME || "lh_order_tiktok_helper",
  tiktok: {
    appKey: process.env.TIKTOK_APP_KEY || "",
    appSecret: process.env.TIKTOK_APP_SECRET || "",
    accessToken: process.env.TIKTOK_ACCESS_TOKEN || "",
    refreshToken: process.env.TIKTOK_REFRESH_TOKEN || "",
    accessTokenExpire: Number(process.env.TIKTOK_ACCESS_TOKEN_EXPIRE || 0),
    refreshTokenExpire: Number(process.env.TIKTOK_REFRESH_TOKEN_EXPIRE || 0),
    shopCipher: process.env.TIKTOK_SHOP_CIPHER || "",
  },
};

module.exports = env;
