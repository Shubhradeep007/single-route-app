const mongoose = require("mongoose");

const CommentSchema = new mongoose.Schema(
  {
    blog: { type: mongoose.Schema.Types.ObjectId, ref: "Blog", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true },
  },
  { timestamps: true, versionKey: false },
);

const CommentModel = mongoose.model("Comment", CommentSchema);

module.exports = CommentModel;
