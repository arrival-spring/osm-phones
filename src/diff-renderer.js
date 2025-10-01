const { diff_match_patch } = require('diff-match-patch');

// Define the regex for separators that are definitively "bad" and should trigger a fix report.
const BAD_SEPARATOR_REGEX = /(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

// This regex is used for splitting by data-processor.js. It catches ALL valid and invalid separators:
// Raw semicolon (';'), semicolon with optional space ('; ?'), comma, slash, 'or' or 'and'.
const UNIVERSAL_SPLIT_REGEX = /(?:; ?)|(?:\s*,\s*)|(?:\s*\/\s*)|(?:\s+or\s+)|(?:\s+and\s+)/gi;

// When used in diff, the groups need to be capturing
const UNIVERSAL_SPLIT_CAPTURE_REGEX = /(; ?)|(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;


// Helper function to escape HTML special characters
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&#39;');
}

/**
 * Removes all non-digit characters from a string.
 * @param {string} text The input string.
 * @returns {string} The normalized string.
 */
function normalize(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[^\d]/g, '');
}

/**
 * Consolidates a lone '+' sign with the following segment.
 * This is crucial after splitting by separators.
 * @param {Array<string>} parts List of string segments.
 * @returns {Array<string>} List of consolidated segments.
 */
function consolidatePlusSigns(parts) {
    const consolidated = [];
    for (let i = 0; i < parts.length; i++) {
        const current = parts[i];
        if (current === '+' && i + 1 < parts.length && parts[i + 1].length > 0) {
            consolidated.push(current + parts[i + 1]);
            i++; // Skip the next part
        } else {
            consolidated.push(current);
        }
    }
    return consolidated;
}

/**
 * Splits a phone number string into segments (numbers and separators).
 * Uses UNIVERSAL_SPLIT_CAPTURE_REGEX to keep the delimiters.
 * @param {string} phoneString The full string (e.g., 'num1; num2').
 * @returns {Array<string>} Segments including numbers and separators.
 */
function splitPhoneNumbers(phoneString) {
    if (!phoneString) return [];
    // Use the provided capturing regex for splitting to keep delimiters
    const tokens = phoneString.split(UNIVERSAL_SPLIT_CAPTURE_REGEX).filter(t => t !== undefined && t !== '');
    return consolidatePlusSigns(tokens);
}

/**
 * Performs a character-level diff on two phone number strings, applying a heuristic
 * to correctly classify formatting changes (spaces/non-digits) as removed/added.
 *
 * @param {string} oldNumber The original phone number string.
 * @param {string} newNumber The suggested phone number string.
 * @returns {{originalDiff: Array<{value: string, removed: boolean}>, oldDiff: string, newDiff: string, suggestedDiff: Array<{value: string, added: boolean}>}} Diff results.
 */
function diffPhoneNumbers(oldNumber, newNumber) {
    const dmp = new diff_match_patch();
    let diff = dmp.diff_main(oldNumber, newNumber);
    dmp.diff_cleanupSemantic(diff);

    // --- FIX: Force Character-by-Character Breakdown of UNCHANGED segments ---
    // This allows the heuristic to correctly isolate single formatting characters.
    const granularDiff = [];
    diff.forEach(([type, text]) => {
        // Only break down type 0 (unchanged) segments with length > 1
        if (type === 0 && text.length > 1) { 
            text.split('').forEach(char => {
                granularDiff.push([type, char]);
            });
        } else {
            granularDiff.push([type, text]);
        }
    });
    diff = granularDiff;
    // -----------------------------------------------------------------------

    let originalDiff = []; 
    let suggestedDiff = []; 

    diff.forEach(part => {
        const type = part[0]; // -1: removed, 0: unchanged, 1: added
        const text = part[1];
        
        // Check for non-digit/non-plus character. Digits and '+' are considered part of the number.
        const isFormattingChar = !text.match(/[\d+]/) && text.length === 1; 

        if (type === 1) { // Added (new number)
            suggestedDiff.push({ value: text, added: true });

        } else if (type === 0) { // Unchanged (both)
            if (isFormattingChar) {
                // HEURISTIC: Formatting characters (like spaces, brackets) that align should be treated as
                // removed in the old number and added in the new number to ensure full highlighting.
                originalDiff.push({ value: text, removed: true }); // Original: REMOVED
                suggestedDiff.push({ value: text, added: true });   // Suggested: ADDED
            } else {
                // Digits or '+' are truly unchanged
                originalDiff.push({ value: text, removed: false });
                suggestedDiff.push({ value: text, added: false });
            }
        } else if (type === -1) { // Removed (old number)
            originalDiff.push({ value: text, removed: true });
        }
    });

    // Final HTML generation from the corrected parts arrays
    const oldDiffHtml = originalDiff.map(p => 
        `<span class="diff-${p.removed ? 'removed' : 'unchanged'}">${escapeHtml(p.value)}</span>`
    ).join('');
    
    const newDiffHtml = suggestedDiff.map(p => 
        `<span class="diff-${p.added ? 'added' : 'unchanged'}">${escapeHtml(p.value)}</span>`
    ).join('');

    return {
        originalDiff: originalDiff, 
        oldDiff: oldDiffHtml,       
        newDiff: newDiffHtml,       
        suggestedDiff: suggestedDiff, 
    };
}


/**
 * High-level function to handle multi-number strings by splitting into segments
 * and running diffPhoneNumbers on the numeric segments.
 *
 * @param {string} oldText The original full string (e.g., 'num1;num2').
 * @param {string} newText The suggested full string.
 * @returns {{oldDiff: string, newDiff: string}}
 */
function getDiffHtml(oldText, newText) {
    const oldParts = splitPhoneNumbers(oldText);
    const newParts = splitPhoneNumbers(newText);

    let oldDiffHtml = '';
    let newDiffHtml = '';

    // Determine the length of the longer parts array
    const maxLength = Math.max(oldParts.length, newParts.length);

    for (let i = 0; i < maxLength; i++) {
        const oldSegment = oldParts[i] || '';
        const newSegment = newParts[i] || '';

        // Check if the segment is a number (contains digits or a leading +)
        const isNumeric = oldSegment.match(/[\d+]/) || newSegment.match(/[\d+]/);

        if (isNumeric) {
            // Treat as a phone number segment and run the detailed diff
            const diffResult = diffPhoneNumbers(oldSegment, newSegment);
            // We use the pre-built HTML strings from diffPhoneNumbers here
            oldDiffHtml += diffResult.oldDiff; 
            newDiffHtml += diffResult.newDiff;

        } else if (oldSegment || newSegment) {
            // Treat as a separator and run a simple character diff
            const dmp = new diff_match_patch();
            const diff = dmp.diff_main(oldSegment, newSegment);
            dmp.diff_cleanupSemantic(diff);

            diff.forEach(part => {
                const type = part[0]; // -1: removed, 0: unchanged, 1: added
                const text = part[1];
                const escapedText = escapeHtml(text);

                if (type === 1) { // Added
                    newDiffHtml += `<span class="diff-added">${escapedText}</span>`;
                } else if (type === 0) { // Unchanged
                    oldDiffHtml += `<span class="diff-unchanged">${escapedText}</span>`;
                    newDiffHtml += `<span class="diff-unchanged">${escapedText}</span>`;
                } else if (type === -1) { // Removed
                    oldDiffHtml += `<span class="diff-removed">${escapedText}</span>`;
                }
            });
        }
    }

    return {
        oldDiff: oldDiffHtml,
        newDiff: newDiffHtml,
    };
}


module.exports = {
    escapeHtml,
    normalize,
    consolidatePlusSigns,
    splitPhoneNumbers,
    diffPhoneNumbers, 
    getDiffHtml 
};