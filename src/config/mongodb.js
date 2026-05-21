const mongoose = require("mongoose");
const env = require("./env");
const Batch = require("../models/Batch");
const IncomeEntry = require("../models/IncomeEntry");
const OrderHeader = require("../models/OrderHeader");
const OrderItem = require("../models/OrderItem");
const ProductMaster = require("../models/ProductMaster");
const PendingPlatformListing = require("../models/PendingPlatformListing");

async function initializeCollections() {
  await Promise.all([
    Batch.createCollection(),
    IncomeEntry.createCollection(),
    OrderHeader.createCollection(),
    OrderItem.createCollection(),
    ProductMaster.createCollection(),
    PendingPlatformListing.createCollection(),
  ]);

  await IncomeEntry.updateMany(
    { entryType: { $exists: false } },
    { $set: { entryType: "Order" } }
  );

  await Promise.all([
    Batch.syncIndexes(),
    IncomeEntry.syncIndexes(),
    OrderHeader.syncIndexes(),
    OrderItem.syncIndexes(),
    ProductMaster.syncIndexes(),
    PendingPlatformListing.syncIndexes(),
  ]);
}

async function connectMongo() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri, {
    dbName: env.databaseName,
  });
  await initializeCollections();
}

async function disconnectMongo() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = {
  connectMongo,
  disconnectMongo,
  initializeCollections,
};
