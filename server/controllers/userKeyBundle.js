const UserKeyBundle = require("../models/UserKeyBundle");

exports.uploadKeyBundle = async (req, res) => {
  try {
    const { identityKey, signedPreKey, signedPreKeySignature, oneTimePreKeys } = req.body;

    if (!identityKey || !signedPreKey || !signedPreKeySignature) {
      return res.status(400).json({ message: "Missing required key fields" });
    }

    const updated = await UserKeyBundle.findOneAndUpdate(
      { userId: req.user._id },
      {
        userId: req.user._id,
        identityKey,
        signedPreKey,
        signedPreKeySignature,
        oneTimePreKeys: Array.isArray(oneTimePreKeys) ? oneTimePreKeys : [],
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ message: "Key bundle uploaded", data: updated });
  } catch (error) {
    console.log("Error in uploadKeyBundle:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

exports.getKeyBundle = async (req, res) => {
  try {
    const { userId } = req.params;

    const bundle = await UserKeyBundle.findOne({ userId }).select(
      "userId identityKey signedPreKey signedPreKeySignature oneTimePreKeys"
    );

    if (!bundle) {
      return res.status(404).json({ message: "Key bundle not found" });
    }

    return res.status(200).json(bundle);
  } catch (error) {
    console.log("Error in getKeyBundle:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};