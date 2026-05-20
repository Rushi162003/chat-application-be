const mongoose = require("mongoose");

const userKeyBundleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    identityKey: { type: String, required: true }, // base64 public key
    signedPreKey: { type: String, required: true }, // base64 public key
    signedPreKeySignature: { type: String, required: true }, // base64 signature
    oneTimePreKeys: [{ type: String }], // base64 public keys
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserKeyBundle", userKeyBundleSchema);