/**
 * Document Data Extraction Engine
 *
 * Pipeline:
 *   1. PDF → pdf-parse for text layer
 *   2. If no text → send raw file to Claude Vision API (reads scanned PDFs/images directly)
 *   3. Images → send directly to Claude Vision API
 *   4. Fallback: local OCR with tesseract.js
 */

const pdfParse = require('pdf-parse');
const path = require('path');

// ─── Text Extraction Layer ──────────────────────────────────

async function extractTextFromPDF(buffer) {
  try {
    const result = await pdfParse(buffer);
    const text = (result.text || '').trim();

    if (text.length > 50) {
      console.log(`[DocExtract] PDF text layer: ${text.length} chars from ${result.numpages} pages`);
      return { text, method: 'pdf-parse' };
    }

    console.log(`[DocExtract] PDF has no/little text layer (${text.length} chars). Will use Vision API.`);
    return { text: '', method: 'needs-vision', buffer };
  } catch (err) {
    console.error('[DocExtract] PDF parse error:', err.message);
    return { text: '', method: 'needs-vision', buffer };
  }
}

/**
 * Extract text from file. Returns { text, method, buffer? }
 * If method is 'needs-vision', the caller should use Claude Vision API
 * with the raw buffer instead of text.
 */
async function extractText(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  console.log(`[DocExtract] Processing: ${file.originalname} (${ext}, ${mime}, ${(file.size / 1024).toFixed(0)} KB)`);

  if (ext === '.pdf' || mime === 'application/pdf') {
    return extractTextFromPDF(file.buffer);
  }

  // For images, always use Vision API (more accurate than OCR)
  if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.webp'].includes(ext) || mime.startsWith('image/')) {
    console.log(`[DocExtract] Image file — will use Vision API directly`);
    return { text: '', method: 'needs-vision', buffer: file.buffer, mime };
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

module.exports = { extractText };
