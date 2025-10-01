const { diffChars } = require('diff');

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
 * * @param {string} original - The phone number to be fixed.
 * @param {string} suggested - The fixed phone number.
 * @returns {{
 * originalDiff: Array<{value: string, added: boolean, removed: boolean}>, 
 * suggestedDiff: Array<{value: string, added: boolean, removed: boolean}>
 * }} The diff objects for rendering two separate lines (Original and Suggested).
 */
function diffPhoneNumbers(original, suggested) {

    // --- 1. Semantic Diff (Digits only) ---
    const normalizedOriginal = normalize(original);
    const normalizedSuggested = normalize(suggested);

    // Get the semantic diff (which digits were added/removed/kept)
    const semanticParts = diffChars(normalizedOriginal, normalizedSuggested);

    // Map the semantic parts back to a simple state array for easy lookup
    let semanticMap = [];
    semanticParts.forEach(part => {
        const state = part.added ? 'added' : (part.removed ? 'removed' : 'unchanged');
        for (let i = 0; i < part.value.length; i++) {
            semanticMap.push(state);
        }
    });

    // --- 2. Visual Diff for Original String (Shows Removals) ---
    let originalDiff = [];
    let semanticIndex = 0; // Pointer for the semantic map

    for (let i = 0; i < original.length; i++) {
        const char = original[i];
        
        if (/\d/.test(char)) {
            // It's a digit. Check its semantic state.
            const state = semanticMap[semanticIndex];
            
            if (state === 'removed') {
                // Digit was removed (e.g., the leading '0')
                originalDiff.push({ value: char, removed: true });
            } else {
                // Digit was kept (unchanged)
                originalDiff.push({ value: char, added: false, removed: false }); 
            }
            semanticIndex++;
        } else {
            // It's a non-digit (formatting). Mark all original formatting as removed/replaced.
            originalDiff.push({ value: char, removed: true });
        }
    }
    
    // --- 3. Visual Diff for Suggested String (Shows Additions) ---
    let suggestedDiff = [];
    let originalDigitPtr = 0; // Pointer for the common sequence digits

    for (let i = 0; i < suggested.length; i++) {
        const char = suggested[i];
        
        if (/\d/.test(char)) {
            // It's a digit. Check if it's a common digit or a new addition.
            if (originalDigitPtr < normalizedOriginal.length && normalizedOriginal[originalDigitPtr] === char) {
                // Digit is part of the common sequence. Keep it UNCHANGED.
                suggestedDiff.push({ value: char, removed: false, added: false });
                originalDigitPtr++;
            } else {
                // Digit is NEW (e.g., the prefix '32').
                suggestedDiff.push({ value: char, added: true });
            }
        } else {
            // It's a non-digit ('+' or space/separator). Mark as ADDED formatting.
            suggestedDiff.push({ value: char, added: true });
        }
    }

    return { originalDiff, suggestedDiff };
}

/**
 * Creates an HTML string with diff highlighting for two phone number strings.
 * @param {string} oldString - The original phone number string.
 * @param {string} newString - The suggested phone number string.
 * @returns {{oldDiff: string, newDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffHtml(oldString, newString) {
  const { originalDiff, suggestedDiff } = diffPhoneNumbers(oldString, newString);
  
  let oldDiffHtml = '';
  let newDiffHtml = '';

  originalDiff.forEach((part) => {
      const colorClass = part.removed ? 'diff-removed' : 'diff-unchanged';
      oldDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
  });

  suggestedDiff.forEach((part) => {
      const colorClass = part.added ? 'diff-added' : 'diff-unchanged';
      newDiffHtml += `<span class="${colorClass}">${part.value}</span>`;
  });

  return { oldDiff: oldDiffHtml, newDiff: newDiffHtml };
}

module.exports = { getDiffHtml };