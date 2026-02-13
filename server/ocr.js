// Lazy load dependencies to prevent startup crashes on Vercel
// const Tesseract = require('tesseract.js');
// const sharp = require('sharp');
const fs = require('fs');

/**
 * Preprocesses an image buffer to improve OCR accuracy.
 * Steps: Grayscale -> Resize (2x) -> Sharpen -> Thresholding
 */
async function preprocessImage(imageBuffer) {
    try {
        const sharp = require('sharp');
        return await sharp(imageBuffer)
            .grayscale()
            .resize({ width: 2000, withoutEnlargement: false }) // Upscale content
            .sharpen()
            .toBuffer();
    } catch (err) {
        console.error('Image preprocessing failed (sharp missing or error):', err.message);
        return imageBuffer; // Fallback to original
    }
}

/**
 * Extracts serial numbers from an image buffer.
 * Standard format: 2 letters, 8 digits, 1 letter (e.g., LB42836549R)
 */
async function extractSerials(imageBuffer, filename) {
    const processedImage = await preprocessImage(imageBuffer);

    let text = '';
    try {
        const Tesseract = require('tesseract.js');
        const result = await Tesseract.recognize(processedImage, 'eng', {
            logger: m => console.log(`[OCR] ${filename}: ${m.status} (${(m.progress * 100).toFixed(0)}%)`),
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        });
        text = result.data.text;
    } catch (e) {
        console.error("OCR Engine failed to load or run:", e);
        throw new Error("OCR Engine unavailable: " + e.message);
    }

    // Extract candidates using regex
    // Strict pattern: 2 letters, 8 numbers, 1 letter
    const strictRegex = /\b[A-Z]{2}\d{8}[A-Z]\b/g;

    // Clean text and find matches
    const cleanText = text.replace(/[^A-Z0-9\s]/g, '').toUpperCase();
    const matches = cleanText.match(strictRegex) || [];

    // Deduplicate within this single file
    const uniqueMatches = [...new Set(matches)];

    console.log(`[OCR] ${filename}: Found ${uniqueMatches.length} serials.`);
    return uniqueMatches;
}

module.exports = { extractSerials };
