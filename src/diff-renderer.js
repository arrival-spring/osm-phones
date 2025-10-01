const { diffChars } = require('diff');
const { UNIVERSAL_SPLIT_CAPTURE_REGEX } = require('./constants.js');

// Used for splitting the suggested fix (assuming standard semicolon separation)
const NEW_SPLIT_CAPTURE_REGEX = /(; ?)/g;


// --- Helper Functions ---

/**
 * Normalizes a phone number string to contain only digits.
 * Used for finding true (semantic) changes in the numbers.
 * @param {string} str - The phone number string.
 * @returns {string} The normalized string (digits only).
 */
const normalize = (str) => str.replace(/[^\d]/g, '');

/**
 * Helper function to consolidate lone '+' signs with the following segment, 
 * ensuring the full international number is treated as one segment.
 * @param {Array<string>} parts - Array of segments from a split operation.
 * @returns {Array<string>} Consolidated array.
 */
function consolidatePlusSigns(parts) {
    let consolidated = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        // 1. Check if the part is a lone '+' (must trim for this check)
        if (part.trim() === '+' && i + 1 < parts.length) {
            // If it is, merge '+' with the next segment (we trim the next segment as it should be a number)
            consolidated.push('+' + parts[i + 1].trim());
            i++; // Skip the next segment, as it was consumed
        } else {
            // 2. Otherwise, keep the segment as is, preserving separator spaces.
            consolidated.push(part);
        }
    }
    // 3. Filter out any remaining pure whitespace or empty strings.
    return consolidated.filter(s => s && s.trim().length > 0);
}


// --- Core Diff Logic ---

/**
 * Performs a two-way diff on phone numbers, separating semantic (digit)
 * changes from visual (formatting/non-digit) changes.
 * * New Logic: Performs a semantic diff to determine digit status (added/removed/unchanged),
 * and uses a full-string visual diff to determine formatting status (+, spaces, etc.).
 * The semantic status overrides the visual status for digits.
 * * @param {string} original - The phone number to be fixed.
 * @param {string} suggested - The fixed phone number.
 * @returns {{
 * originalDiff: Array<{value: string, added: boolean, removed: boolean}>, 
 * suggestedDiff: Array<{value: string, added: boolean, removed: boolean}>
 * }} The diff objects for rendering two separate lines.
 */
function diffPhoneNumbers(original, suggested) {
    // 1. Semantic Diff (Digits only) - Provides the map of common/removed/added digits
    const normalizedOriginal = normalize(original);
    const normalizedSuggested = normalize(suggested);
    const semanticParts = diffChars(normalizedOriginal, normalizedSuggested);

    const digitStatusMap = new Map();
    let oldIdx = 0;
    let newIdx = 0;
    
    // Build the status map for digits (OLD and NEW indices)
    semanticParts.forEach(part => {
        if (part.removed) {
            for (let i = 0; i < part.value.length; i++) {
                digitStatusMap.set(`OLD:${oldIdx++}`, 'removed');
            }
        } else if (part.added) {
            for (let i = 0; i < part.value.length; i++) {
                digitStatusMap.set(`NEW:${newIdx++}`, 'added');
            }
        } else { // unchanged
            for (let i = 0; i < part.value.length; i++) {
                digitStatusMap.set(`OLD:${oldIdx++}`, 'unchanged');
                digitStatusMap.set(`NEW:${newIdx++}`, 'unchanged');
            }
        }
    });

    // 2. Visual Diff (Full string) - Provides the baseline map for formatting
    const visualParts = diffChars(original, suggested);

    let originalPointer = 0; // Pointer for original digits in the status map
    let suggestedPointer = 0; // Pointer for suggested digits in the status map
    let originalDiff = [];
    let suggestedDiff = [];

    visualParts.forEach(part => {
        const isDigit = /\d/.test(part.value);

        if (!part.added) { // Part exists in original string
            for (const char of part.value) {
                if (isDigit) {
                    // Use semantic status for digits
                    const status = digitStatusMap.get(`OLD:${originalPointer++}`);
                    originalDiff.push({ 
                        value: char, 
                        removed: status === 'removed', 
                        added: false // Digits in old string are never marked added
                    });
                } else { 
                    // Use visual diff status for formatting (non-digits)
                    originalDiff.push({ 
                        value: char, 
                        removed: part.removed, // true if removed, false if unchanged (common formatting)
                        added: false 
                    });
                }
            }
        }

        if (!part.removed) { // Part exists in suggested string
            for (const char of part.value) {
                if (isDigit) {
                    // Use semantic status for digits
                    const status = digitStatusMap.get(`NEW:${suggestedPointer++}`);
                    suggestedDiff.push({ 
                        value: char, 
                        added: status === 'added', 
                        removed: false // Digits in new string are never marked removed
                    });
                } else { 
                    // Use visual diff status for formatting (non-digits)
                    suggestedDiff.push({ 
                        value: char, 
                        added: part.added, // true if added, false if unchanged (common formatting)
                        removed: false 
                    });
                }
            }
        }
    });

    return { originalDiff, suggestedDiff };
}


// --- HTML Generation Logic ---

/**
 * Creates an HTML string with diff highlighting for two phone number strings, 
 * handling multiple numbers separated by various delimiters.
 * @param {string} oldString - The original phone number string(s).
 * @param {string} newString - The suggested phone number string(s).
 * @returns {{oldDiff: string, newDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffHtml(oldString, newString) {
    // 1. Split and initial filter for both strings
    const oldPartsUnfiltered = oldString.split(UNIVERSAL_SPLIT_CAPTURE_REGEX);
    // Filter out falsey values (undefined from capturing groups) and empty strings
    const oldParts = oldPartsUnfiltered.filter(s => s && s.trim().length > 0);

    const newPartsUnfiltered = newString.split(NEW_SPLIT_CAPTURE_REGEX);
    const newParts = newPartsUnfiltered.filter(s => s && s.trim().length > 0);

    // 2. CONSOLIDATION FIX: Apply consolidation to both old and new parts
    const consolidatedOldParts = consolidatePlusSigns(oldParts);
    const consolidatedNewParts = consolidatePlusSigns(newParts);

    let oldDiffHtml = '';
    let newDiffHtml = '';
    
    // Iterate over the minimum length of the new, consolidated arrays
    const numSegments = Math.min(consolidatedOldParts.length, consolidatedNewParts.length);
    
    for (let i = 0; i < numSegments; i++) {
        const oldSegment = consolidatedOldParts[i];
        const newSegment = consolidatedNewParts[i];
        
        // Identify a phone number: MUST contain at least one digit.
        const isPhoneNumber = /\d/.test(normalize(oldSegment)); // Check normalized value to ensure we don't accidentally check separators like "+".

        if (isPhoneNumber) {
            // --- This is a phone number segment ---
            const { originalDiff, suggestedDiff } = diffPhoneNumbers(oldSegment, newSegment);
            
            originalDiff.forEach((part) => {
                const colorClass = part.removed ? 'diff-removed' : 'diff-unchanged';
                oldDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
            });

            suggestedDiff.forEach((part) => {
                const colorClass = part.added ? 'diff-added' : 'diff-unchanged';
                newDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
            });
        } else {
            // --- This is a separator (e.g., ';', 'or', ',') ---
            // NEW LOGIC: Diff the separators to find common parts (like ';') and changed parts (like ' ')
            const separatorDiff = diffChars(oldSegment, newSegment);
            
            separatorDiff.forEach(part => {
                // Handle oldDiffHtml (removed/unchanged)
                if (!part.added) {
                    const colorClass = part.removed ? 'diff-removed' : 'diff-unchanged';
                    oldDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
                }

                // Handle newDiffHtml (added/unchanged)
                if (!part.removed) {
                    const colorClass = part.added ? 'diff-added' : 'diff-unchanged';
                    newDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
                }
            });
        }
    }

    // Append any trailing parts
    oldDiffHtml += consolidatedOldParts.slice(numSegments).join('');
    newDiffHtml += consolidatedNewParts.slice(numSegments).join('');

    return { oldDiff: oldDiffHtml, newDiff: newDiffHtml };
}

module.exports = { normalize, consolidatePlusSigns, diffPhoneNumbers, getDiffHtml };