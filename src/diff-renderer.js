const { diffChars } = require('diff');
const { UNIVERSAL_SPLIT_CAPTURE_REGEX } = require('./constants.js');

/**
 * Normalizes a phone number string to contain only digits.
 * This is used for finding true (semantic) changes in the numbers.
 * @param {string} str - The phone number string.
 * @returns {string} The normalized string (digits only).
 */
const normalize = (str) => str.replace(/[^\d]/g, '');

/**
 * Performs a two-way diff on phone numbers, separating semantic (digit)
 * changes from visual (formatting) changes.
 * @param {string} original - The phone number to be fixed.
 * @param {string} suggested - The fixed phone number.
 * @returns {{
 * originalDiff: Array<{value: string, added: boolean, removed: boolean}>, 
 * suggestedDiff: Array<{value: string, added: boolean, removed: boolean}>
 * }} The diff objects for rendering two separate lines.
 */
function diffPhoneNumbers(original, suggested) {
    // --- 1. Semantic Diff (Digits only) ---
    const normalizedOriginal = normalize(original);
    const normalizedSuggested = normalize(suggested);
    const semanticParts = diffChars(normalizedOriginal, normalizedSuggested);

    // Create a sequential map of digits for the common sequence
    let commonDigits = [];
    semanticParts.forEach(part => {
        if (!part.added && !part.removed) {
            commonDigits.push(...part.value.split(''));
        }
    });

    // --- 2. Visual Diff for Original String (Removals) ---
    let originalDiff = [];
    let semanticIndex = 0;

    for (let i = 0; i < original.length; i++) {
        const char = original[i];

        if (/\d/.test(char)) {
            // Check semantic map state at current digit index
            const state = semanticParts.reduce((acc, part) => {
                if (acc.remaining === 0) return acc;

                const len = part.value.length;
                if (acc.targetIndex >= acc.processed && acc.targetIndex < acc.processed + len) {
                    acc.state = part.added ? 'added' : part.removed ? 'removed' : 'unchanged';
                    acc.remaining = 0;
                }
                acc.processed += len;
                return acc;
            }, { processed: 0, targetIndex: semanticIndex, remaining: 1, state: 'unchanged' }).state;

            if (state === 'removed') {
                originalDiff.push({ value: char, removed: true });
            } else {
                originalDiff.push({ value: char, added: false, removed: false });
            }
            semanticIndex++;
        } else {
            // Formatting removal
            originalDiff.push({ value: char, removed: true });
        }
    }

    // --- 3. Visual Diff for Suggested String (Additions) ---
    let suggestedDiff = [];
    let commonDigitPtr = 0; // Pointer for the commonDigits array

    for (let i = 0; i < suggested.length; i++) {
        const char = suggested[i];

        if (/\d/.test(char)) {
            // It's a digit. Check if it's the next digit in the common sequence.
            if (commonDigitPtr < commonDigits.length && commonDigits[commonDigitPtr] === char) {
                // Digit is part of the common sequence. UNCHANGED.
                suggestedDiff.push({ value: char, removed: false, added: false });
                commonDigitPtr++;
            } else {
                // Digit is NEW (e.g., prefix '32' or a replaced digit). ADDED.
                suggestedDiff.push({ value: char, added: true });
            }
        } else {
            // Non-digit ('+' or space/separator). ADDED formatting.
            suggestedDiff.push({ value: char, added: true });
        }
    }

    return { originalDiff, suggestedDiff };
}

// The suggested fix should always use '; ' as the separator, but we'll use a 
// flexible split to handle potential variations in the fix string too.
const NEW_SPLIT_CAPTURE_REGEX = /(; ?)/g;

/**
 * Creates an HTML string with diff highlighting for two phone number strings, 
 * handling multiple numbers separated by various delimiters.
 * @param {string} oldString - The original phone number string(s).
 * @param {string} newString - The suggested phone number string(s).
 * @returns {{oldDiff: string, newDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffHtml(oldString, newString) {
    // Split the old string using the comprehensive capturing regex
    // Filter out empty strings that result from the split (e.g., if a number is at the start/end)
    const oldParts = oldString.split(UNIVERSAL_SPLIT_CAPTURE_REGEX).filter(s => s && s.trim() !== '');

    // Split the new string using a simpler capturing regex (assuming standard semicolon separation)
    const newParts = newString.split(NEW_SPLIT_CAPTURE_REGEX).filter(s => s && s.trim() !== '');

    let oldDiffHtml = '';
    let newDiffHtml = '';

    // We iterate over the minimum length to ensure we always have matching pairs of segments
    const numSegments = Math.min(oldParts.length, newParts.length);

    for (let i = 0; i < numSegments; i++) {
        const oldSegment = oldParts[i].trim();
        const newSegment = newParts[i].trim();

        // Determine if the segment is a separator or an actual phone number
        // A separator will typically contain non-numeric characters like ;, /, or words like 'or'/'and'.
        const isOldSeparator = !oldSegment.match(/^\+?[\d\s]+$/);
        const isNewSeparator = !newSegment.match(/^\+?[\d\s]+$/);

        if (isOldSeparator || isNewSeparator) {
            // --- This is a separator ---

            // Mark the old separator as REMOVED (or changed)
            oldDiffHtml += `<span class="diff-removed">${oldSegment}</span>`;

            // Mark the new separator as ADDED
            newDiffHtml += `<span class="diff-added">${newSegment}</span>`;

        } else {
            // --- This is a phone number segment ---

            // Call the specialized single-number diff function
            const { originalDiff, suggestedDiff } = diffPhoneNumbers(oldSegment, newSegment);

            // Append the diff results for the current number
            originalDiff.forEach((part) => {
                const colorClass = part.removed ? 'diff-removed' : 'diff-unchanged';
                oldDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
            });

            suggestedDiff.forEach((part) => {
                const colorClass = part.added ? 'diff-added' : 'diff-unchanged';
                newDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
            });
        }
    }

    // Append any trailing parts if one string was longer than the other
    oldDiffHtml += oldParts.slice(numSegments).join('');
    newDiffHtml += newParts.slice(numSegments).join('');

    return { oldDiff: oldDiffHtml, newDiff: newDiffHtml };
}

module.exports = { getDiffHtml };