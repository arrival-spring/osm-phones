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
 * Performs a character-level diff on two phone number strings, ensuring the longest common
 * digit sequence is aligned, even if formatting changes occur.
 *
 * @param {string} oldNumber The original phone number string.
 * @param {string} newNumber The suggested phone number string.
 * @returns {Array<Array<number, string>>} Standardized diff array: [type, value].
 */
function getPhoneDiffArray(oldNumber, newNumber) {
    const dmp = new diff_match_patch();
    
    // 1. Initial character diff
    let diff = dmp.diff_main(oldNumber, newNumber); 

    // 2. Apply aggressive semantic cleanup. This prioritizes aligning digits.
    dmp.diff_cleanupSemantic(diff);

    // 3. Post-Processing: Enforce Common Digit Preservation
    // Digits that belong to the UNCHANGED core of the normalized strings must be marked as UNCHANGED (0).
    const normalizedOld = normalize(oldNumber);
    const normalizedNew = normalize(newNumber);

    // Get the true digit-level diff (e.g., [0, '471124380'], [-1, '0'], [1, '32'])
    const normalizedDiff = dmp.diff_main(normalizedOld, normalizedNew);

    let normalizedOldPos = 0; // Tracks position in normalizedOld
    let normalizedNewPos = 0; // Tracks position in normalizedNew
    
    const finalDiff = [];
    
    // Helper to find if a position in the normalized string belongs to an UNCHANGED segment
    const isPositionUnchanged = (normalizedDiff, normalizedPos, isOriginal) => {
        let currentOffset = 0;
        for (const [normType, normText] of normalizedDiff) {
            const isChangeType = (isOriginal && normType === -1) || (!isOriginal && normType === 1);
            if (normType === 0 || isChangeType) {
                if (currentOffset <= normalizedPos && normalizedPos < currentOffset + normText.length) {
                    return normType === 0;
                }
                currentOffset += normText.length;
            }
        }
        return false;
    };
    
    // Loop through the character diff array (diff)
    diff.forEach(([type, text]) => {
        // Break down all segments into single characters
        text.split('').forEach(char => {
            let finalType = type;

            // Check if the character is a digit
            if (char.match(/\d/)) {
                let isOriginalDigit = (type === 0 || type === -1);
                let isSuggestedDigit = (type === 0 || type === 1);
                
                // If the digit originated from the OLD string (type 0 or -1)
                if (isOriginalDigit) {
                    if (isPositionUnchanged(normalizedDiff, normalizedOldPos, true)) {
                        finalType = 0;
                    }
                    normalizedOldPos++;
                }
                
                // If the digit originated from the NEW string (type 0 or 1)
                if (isSuggestedDigit) {
                    if (isPositionUnchanged(normalizedDiff, normalizedNewPos, false)) {
                        finalType = 0;
                    }
                    normalizedNewPos++;
                }
            }

            finalDiff.push([finalType, char]);
        });
    });

    return finalDiff;
}

/**
 * Converts a standardized diff array into HTML spans, applying the formatting heuristic.
 *
 * The heuristic is: Any formatting character (non-digit, non-plus) that is marked as 
 * UNCHANGED (type 0) by the diff algorithm is highlighted as REMOVED in the original 
 * view and ADDED in the suggested view, ensuring full highlighting of formatting changes.
 *
 * @param {Array<Array<number, string>>} diffArray The array of diff tuples ([type, value]).
 * @param {string} type 'original' or 'suggested' to determine highlighting classes.
 * @returns {string} HTML string with diff spans.
 */
function renderDiffToHtml(diffArray, type) {
    let html = '';
    const isOriginal = type === 'original';

    diffArray.forEach(part => {
        const [partType, value] = part;
        const escapedValue = escapeHtml(value);
        
        // Check for non-digit/non-plus character.
        const isFormattingChar = !value.match(/[\d+]/); 

        if (partType === 1 && !isOriginal) { 
            // Actual Addition: only render in suggested view
            html += `<span class="diff-added">${escapedValue}</span>`;
        } else if (partType === -1 && isOriginal) { 
            // Actual Removal: only render in original view
            html += `<span class="diff-removed">${escapedValue}</span>`;
        } else if (partType === 0) { 
            // Unchanged (Present in both)
            let className = 'diff-unchanged';
            
            // Heuristic application: Mark unchanged formatting as removed/added
            // Digits forced to 0 above will be rendered as diff-unchanged here.
            if (isFormattingChar) {
                className = isOriginal ? 'diff-removed' : 'diff-added';
            }
            
            // Render type 0 parts in both views
            html += `<span class="${className}">${escapedValue}</span>`;
        }
    });

    return html;
}

/**
 * High-level function to generate the final HTML diffs for multi-number strings.
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

    const maxLength = Math.max(oldParts.length, newParts.length);

    for (let i = 0; i < maxLength; i++) {
        const oldSegment = oldParts[i] || '';
        const newSegment = newParts[i] || '';

        // Check if the segment is a number (contains digits or a leading +)
        const isNumeric = oldSegment.match(/[\d+]/) || newSegment.match(/[\d+]/);

        if (isNumeric) {
            // Treat as a phone number segment and run the detailed diff
            const diffArray = getPhoneDiffArray(oldSegment, newSegment);
            
            // Render HTML from the diff array using the formatting heuristic
            oldDiffHtml += renderDiffToHtml(diffArray, 'original'); 
            newDiffHtml += renderDiffToHtml(diffArray, 'suggested');

        } else if (oldSegment || newSegment) {
            // Treat as a separator. Use a simple full replacement if they are not identical.
            if (oldSegment === newSegment) {
                const escapedText = escapeHtml(oldSegment);
                oldDiffHtml += `<span class="diff-unchanged">${escapedText}</span>`;
                newDiffHtml += `<span class="diff-unchanged">${escapedText}</span>`;
            } else {
                if (oldSegment) {
                    oldDiffHtml += `<span class="diff-removed">${escapeHtml(oldSegment)}</span>`;
                }
                if (newSegment) {
                    newDiffHtml += `<span class="diff-added">${escapeHtml(newSegment)}</span>`;
                }
            }
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
    getPhoneDiffArray, // Returns the diff array [type, value]
    renderDiffToHtml,    // Converts the diff array to HTML
    getDiffHtml 
};
