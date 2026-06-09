const cloudinary = require("../config/cloudinary");

const uploadBufferToCloudinary = (file, resourceType) => {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
    return cloudinary.uploader.upload(dataUri, { resource_type: resourceType });
};

exports.uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const result = await uploadBufferToCloudinary(req.file, "image");
        return res.status(200).json({
            message: "Image uploaded successfully",
            url: result.secure_url,
            publicId: result.public_id,
        });
    } catch (error) {
        console.log("Error in uploadImage:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};

exports.uploadVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        const result = await uploadBufferToCloudinary(req.file, "video");
        return res.status(200).json({
            message: "Video uploaded successfully",
            url: result.secure_url,
            publicId: result.public_id,
        });
    } catch (error) {
        console.log("Error in uploadVideo:", error);
        return res.status(500).json({ message: "Something went wrong" });
    }
};
