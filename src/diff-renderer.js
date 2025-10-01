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

// Assuming new string separator is always a standard semicolon separation
const NEW_SPLIT_CAPTURE_REGEX = /(; ?)/g;

/**
 * Creates an HTML string with diff highlighting for two phone number strings, 
 * handling multiple numbers separated by various delimiters.
 * @param {string} oldString - The original phone number string(s).
 * @param {string} newString - The suggested phone number string(s).
 * @returns {{oldDiff: string, newDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffHtml(oldString, newString) {
    // 1. Split and initial filter
    const oldPartsUnfiltered = oldString.split(UNIVERSAL_SPLIT_CAPTURE_REGEX);
    const oldParts = oldPartsUnfiltered.filter(s => s && s.trim().length > 0);
    const newParts = newString.split(NEW_SPLIT_CAPTURE_REGEX).filter(s => s && s.trim().length > 0);

    // 2. CONSOLIDATION FIX: Merge any lone '+' segment with the next number segment
    let consolidatedOldParts = [];
    for (let i = 0; i < oldParts.length; i++) {
        const part = oldParts[i];
        const trimmedPart = part.trim();

        // If the segment is ONLY '+', AND the next segment exists, merge them
        if (trimmedPart === '+' && i + 1 < oldParts.length) {
            // Merge '+' with the trimmed version of the next segment
            consolidatedOldParts.push(trimmedPart + oldParts[i + 1].trim());
            i++; // Skip the next segment, as it was consumed
        } else {
            // Otherwise, keep the segment as is (trimmed)
            consolidatedOldParts.push(trimmedPart);
        }
    }

    let oldDiffHtml = '';
    let newDiffHtml = '';

    // We iterate over the minimum length of the new, consolidated arrays
    const numSegments = Math.min(consolidatedOldParts.length, newParts.length);

    for (let i = 0; i < numSegments; i++) {
        const oldSegment = consolidatedOldParts[i];
        const newSegment = newParts[i].trim(); // Ensure new segment is always trimmed

        // Identify a phone number: MUST contain at least one digit.
        const isPhoneNumber = /\d/.test(oldSegment);

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
            // If the old segment was a separator, it is removed/replaced
            oldDiffHtml += `<span class="diff-removed">${oldSegment}</span>`;

            // The new segment (expected to be '; ' or similar) is added
            newDiffHtml += `<span class="diff-added">${newSegment}</span>`;
        }
    }

    // Append any trailing parts if one string was longer than the other
    oldDiffHtml += oldParts.slice(numSegments).join('');
    newDiffHtml += newParts.slice(numSegments).join('');

    return { oldDiff: oldDiffHtml, newDiff: newDiffHtml };
}

module.exports = { getDiffHtml };