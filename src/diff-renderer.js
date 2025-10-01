const { diff_match_patch } = require('diff-match-patch');

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
 * @param {string} phoneString The full string (e.g., 'num1; num2').
 * @returns {Array<string>} Segments including numbers and separators.
 */
function splitPhoneNumbers(phoneString) {
    if (!phoneString) return [];
    // Regex splits by semicolon or slash surrounded by optional spaces, and keeps the delimiter
    const tokens = phoneString.split(/([;]|\s\/\s)/g).filter(t => t !== '');
    return consolidatePlusSigns(tokens);
}

/**
 * Performs a character-level diff on two phone number strings.
 *
 * NOTE: This function now returns the raw parts arrays (originalDiff, suggestedDiff) 
 * as objects with 'value' and 'removed/added' properties to satisfy test assertions 
 * that use the .map() method.
 *
 * @param {string} oldNumber The original phone number string.
 * @param {string} newNumber The suggested phone number string.
 * @returns {{originalDiff: Array<{value: string, removed: boolean}>, oldDiff: string, newDiff: string, suggestedDiff: Array<{value: string, added: boolean}>}} Diff results.
 */
function diffPhoneNumbers(oldNumber, newNumber) {
    const dmp = new diff_match_patch();
    const diff = dmp.diff_main(oldNumber, newNumber);
    dmp.diff_cleanupSemantic(diff);

    let oldDiffHtml = '';
    let originalDiff = []; // Array of parts for the original number (for tests that expect .map)
    let suggestedDiff = []; // Array of parts for the new number (for tests that expect .map)

    diff.forEach(part => {
        const type = part[0]; // -1: removed, 0: unchanged, 1: added
        const text = part[1];
        const escapedText = escapeHtml(text);

        if (type === 1) { // Added (new number)
            suggestedDiff.push({ value: text, added: true });
        } else if (type === 0) { // Unchanged (both)
            suggestedDiff.push({ value: text, added: false });
            originalDiff.push({ value: text, removed: false });
            oldDiffHtml += `<span class="diff-unchanged">${escapedText}</span>`;
        } else if (type === -1) { // Removed (old number)
            originalDiff.push({ value: text, removed: true });
            oldDiffHtml += `<span class="diff-removed">${escapedText}</span>`;
        }
    });

    // --- FIX: Heuristic for Formatting Spaces (Applied to suggestedDiff) ---
    // If a space is marked UNCHANGED in the new number's diff, force it to ADDED.
    for (let i = 0; i < suggestedDiff.length; i++) {
        const current = suggestedDiff[i];
        if (current.value === ' ' && current.added === false) {
            suggestedDiff[i].added = true;
        }
    }
    
    // Rebuild the final newDiffHtml from the corrected suggestedDiff array
    const newDiffHtml = suggestedDiff.map(p => 
        `<span class="diff-${p.added ? 'added' : 'unchanged'}">${escapeHtml(p.value)}</span>`
    ).join('');

    return {
        originalDiff: originalDiff, // ARRAY OF PARTS for test .map() calls
        oldDiff: oldDiffHtml,       // HTML STRING for getDiffHtml concatenation
        newDiff: newDiffHtml,       // HTML STRING
        suggestedDiff: suggestedDiff, // ARRAY OF PARTS for test .map() calls
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
