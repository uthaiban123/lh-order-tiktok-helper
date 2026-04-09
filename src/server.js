const app = require("./app");
const env = require("./config/env");
const { connectMongo } = require("./config/mongodb");

async function start() {
  await connectMongo();

  app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
