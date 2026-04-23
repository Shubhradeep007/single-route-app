const mongoose = require("mongoose");

const WriterSchema = new mongoose.Schema(
  {
    writerName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, default: null },
    role: { type: String, enum: ["writer"], default: "writer" },
    apiKey: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    is_FirstLogin: { type: Boolean, default: true },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

const WriterModel = mongoose.model("Writer", WriterSchema);

module.exports = WriterModel;
