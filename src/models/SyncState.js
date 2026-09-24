const mongoose = require("mongoose");

const syncStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    cursorUnix: Number,
    lastRunAt: Date,
    lastSuccessAt: Date,
    lastError: {
      type: String,
      default: "",
    },
    lastStats: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    accessToken: String,
    refreshToken: String,
    accessTokenExpire: Number,
    refreshTokenExpire: Number,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SyncState", syncStateSchema);
