import express from "express";
import db from "../db/index.js";
import ensureAuthenticated from "../authMiddleware/authMiddleware.js";
import multer from "multer";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Multer configuration for image upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = path.join(__dirname, 'uploads');
      fs.mkdir(uploadDir, { recursive: true }).catch(err => console.error('Error creating uploads directory:', err));
      cb(null, uploadDir); // Save in /uploads folder
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
    },
  });

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'image/png') {
    cb(null, true);
  } else {
    cb(new Error('Only PNG and JPG files are allowed!'), false);
  }
};

// Limit file size to 5MB
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Profile picture upload route
router.post('/upload-profile-picture', ensureAuthenticated, (req, res, next) => {
  upload.single('profilePicture')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.flash('error', 'File too large or invalid file type');
      return res.redirect('/settings');
    } else if (err) {
      req.flash('error', 'Error uploading profile picture');
      return res.redirect('/profile');
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error', 'Please upload a profile picture');
      return res.redirect('/settings');
    }

    const userId = req.user.id;

    const userResult = await db.query('SELECT profile_picture FROM userprofile WHERE id = $1', [userId]);
    const oldImagePath = userResult.rows[0].profile_picture;

    if (oldImagePath && oldImagePath !== '/uploads/default-profile.png') {
      const oldImageFilePath = path.join(__dirname, '..', oldImagePath); // Resolve the full path
      try {
        await fs.unlink(oldImageFilePath);
        console.log('Old image deleted successfully');
      } catch (err) {
        console.error('Error deleting old image:', err);
      }
    }

    const originalPath = req.file.path; // ./uploads/filename.ext
    const outputPath = `./uploads/resized-${req.file.filename}`; // ./uploads/resized-filename.ext

    await sharp(originalPath)
      .resize(250, 250) // Set desired width and height
      .toFile(outputPath);

    // Delete the original uploaded file
    try {
        await fs.unlink(originalPath);
        console.log('Original image deleted successfully');
      } catch (err) {
        console.error('Error deleting original image:', err);
      }

    // Save the resized image path to PostgreSQL
    const imagePath = `/uploads/resized-${req.file.filename}`;

    await db.query('UPDATE userprofile SET profile_picture = $1 WHERE id = $2', [
      imagePath,
      userId,
    ]);

    req.flash('success', 'Profile picture updated successfully!');
    res.redirect('/profile');
  } catch (error) {
    console.log(error);
    console.error('Error uploading profile picture:', error);
    req.flash('error', 'Error uploading profile picture');
    res.redirect('/settings');
  }
});

export default router;
