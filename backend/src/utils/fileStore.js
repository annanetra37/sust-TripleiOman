const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Save an uploaded file to disk. Returns the stored file path.
 */
function saveFile(file, companyId) {
  const ext = path.extname(file.originalname) || '.bin';
  const dir = path.join(UPLOADS_DIR, companyId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const storedName = `${uuid()}${ext}`;
  const filePath = path.join(dir, storedName);
  fs.writeFileSync(filePath, file.buffer);

  return {
    storedFilePath: path.relative(UPLOADS_DIR, filePath), // e.g., "companyId/uuid.pdf"
    storedFileSize: file.size,
    storedFileMime: file.mimetype,
  };
}

/**
 * Save multiple files. Returns array of stored file info.
 */
function saveFiles(files, companyId) {
  return files.map((f) => ({ ...saveFile(f, companyId), originalName: f.originalname }));
}

/**
 * Get absolute path for a stored file.
 */
function getFilePath(relativePath) {
  return path.join(UPLOADS_DIR, relativePath);
}

module.exports = { saveFile, saveFiles, getFilePath, UPLOADS_DIR };
