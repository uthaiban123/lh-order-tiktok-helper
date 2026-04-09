const path = require("path");

const appName = "lh-order-tiktok-helper";
const deployUser = process.env.DEPLOY_USER || "deploy";
const deployHost = process.env.DEPLOY_HOST || "your-server-host";
const deployRef = process.env.DEPLOY_REF || "origin/main";
const deployRepo =
  process.env.DEPLOY_REPO || "git@github.com:YOUR_ORG/lh-order-tiktok-helper.git";
const deployPath =
  process.env.DEPLOY_PATH || `/srv/${appName}`;
const sharedEnvFile =
  process.env.SHARED_ENV_FILE || `${deployPath}/shared/.env`;
const nodeBin =
  process.env.NODE_BIN || `/home/${deployUser}/.nvm/versions/node/v20.18.0/bin`;
const productionPort = Number(process.env.PORT || 6600);

module.exports = {
  apps: [
    {
      name: appName,
      script: "src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: productionPort,
        ENV_FILE: sharedEnvFile,
      },
    },
  ],

  deploy: {
    production: {
      user: deployUser,
      host: deployHost,
      ref: deployRef,
      repo: deployRepo,
      path: deployPath,
      "post-deploy":
        `cd ${deployPath}/current && ` +
        `export PATH=${nodeBin}:$PATH && ` +
        "npm ci --omit=dev && " +
        `pm2 reload ecosystem.config.cjs --only ${appName} --env production && ` +
        "pm2 save",
    },
  },
};
