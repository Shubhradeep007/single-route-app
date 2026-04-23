const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    userName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: { type: String, enum: ["user"], default: "user" },
    isActive: { type: Boolean, default: true },
    refreshToken: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

const UserModel = mongoose.model("User", UserSchema);

module.exports = UserModel;
