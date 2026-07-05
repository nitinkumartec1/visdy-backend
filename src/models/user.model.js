import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true, // ✅ corrected typo: "lowecase" to "lowercase"
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    avatar: {
      type: String, // cloudinary URL
      required: true,
    },
    avatarPublicId: {
      type: String,
    },
    coverImage: {
      type: String, // optional cloudinary URL
    },
    coverImagePublicId: {
      type: String,
    },
    watchHistory: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    watchLater: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
      },
    ],
    password: {
      type: String,
      // Password is required only for local (email/password) accounts.
      // Firebase-authenticated users (Google, email-link) don't have one.
      required: [
        function () {
          return this.authProvider === "local";
        },
        "password is required for local accounts",
      ],
    },
    refreshToken: {
      type: String,
    },
    firebaseUid: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values (local users don't have this)
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "email-link"],
      default: "local",
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    }
  },
  {
    timestamps: true,
  }
);

//
// 🔐 Pre-save hook: Hash the password before saving
//
userSchema.pre("save", async function (next) {
  // Skip hashing if password is not set (Firebase users) or not modified
  if (!this.password || !this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt); // Hashing password
    next();
  } catch (err) {
    next(err); // Pass error to next middleware if any
  }
});

//
// ✅ Compare password during login
//
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

//
// 🔑 Generate Access Token
//
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      fullName: this.fullName,
      role: this.role,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

//
// 🔁 Generate Refresh Token
//
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

//
// 📦 Export User model
//
export const User = mongoose.model("User", userSchema);
