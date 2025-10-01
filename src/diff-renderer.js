const { diffChars } = require('diff'); // This must be available globally or imported

// Define constants for the split regexes
const UNIVERSAL_SPLIT_CAPTURE_REGEX = /(; ?)|(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;
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
        
        if (part.trim() === '+' && i + 1 < parts.length) {
            consolidated.push('+' + parts[i + 1].trim());
            i++; 
        } else {
            consolidated.push(part);
        }
    }
    return consolidated.filter(s => s && s.trim().length > 0);
}


// --- Core Diff Logic ---

/**
 * Performs a two-way diff on phone numbers, separating semantic (digit)
 * changes from visual (formatting/non-digit) changes.
 * * FIX: Implements a heuristic override for non-digits in the original string.
 * Spaces and parentheses are forced to be 'removed' if the visual diff doesn't 
 * mark the entire block as unchanged, preventing the old formatting from showing 
 * as 'unchanged' when it clearly changed its position/context.
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
        const status = part.removed ? 'removed' : (part.added ? 'added' : 'unchanged');
        if (part.removed || status === 'unchanged') {
            for (let i = 0; i < part.value.length; i++) {
                digitStatusMap.set(`OLD:${oldIdx++}`, status);
            }
        } 
        if (part.added || status === 'unchanged') {
            for (let i = 0; i < part.value.length; i++) {
                digitStatusMap.set(`NEW:${newIdx++}`, status);
            }
        }
    });

    // 2. Visual Diff (Full string) - Provides the baseline map for formatting
    const visualParts = diffChars(original, suggested);

    let originalPointer = 0; 
    let suggestedPointer = 0; 
    let originalDiff = [];
    let suggestedDiff = [];

    visualParts.forEach(part => {
        
        // --- Process Original String (Removals/Unchanged) ---
        if (!part.added) { 
            for (const char of part.value) {
                if (/\d/.test(char)) {
                    // Rule 1: Digits are always determined by semantic map.
                    const status = digitStatusMap.get(`OLD:${originalPointer++}`);
                    originalDiff.push({ 
                        value: char, 
                        removed: status === 'removed', 
                        added: false 
                    });
                } else { 
                    // Rule 2: Non-digits (formatting).
                    let removedStatus = part.removed;

                    // Heuristic FIX: If the visual diff marked a non-digit as UNCHANGED 
                    // (i.e., !part.removed is true) but it is not the structural '+' sign, 
                    // we must force it to be REMOVED to clear out old formatting (spaces, parens).
                    if (!removedStatus && char !== '+') {
                        removedStatus = true;
                    }
                    
                    originalDiff.push({ 
                        value: char, 
                        removed: removedStatus, 
                        added: false 
                    });
                }
            }
        }

        // --- Process Suggested String (Additions/Unchanged) ---
        if (!part.removed) { 
            for (const char of part.value) {
                if (/\d/.test(char)) {
                    // Rule 1: Digits are always determined by semantic map.
                    const status = digitStatusMap.get(`NEW:${suggestedPointer++}`);
                    suggestedDiff.push({ 
                        value: char, 
                        added: status === 'added', 
                        removed: false 
                    });
                } else { 
                    // Rule 3: Non-digits in suggested string are ADDED, unless UNCHANGED (e.g., common '+').
                    suggestedDiff.push({ 
                        value: char, 
                        added: part.added, 
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
    const oldParts = oldPartsUnfiltered.filter(s => s && s.trim().length > 0);

    const newPartsUnfiltered = newString.split(NEW_SPLIT_CAPTURE_REGEX);
    const newParts = newPartsUnfiltered.filter(s => s && s.trim().length > 0);

    // 2. CONSOLIDATION FIX: Apply consolidation
    const consolidatedOldParts = consolidatePlusSigns(oldParts);
    const consolidatedNewParts = consolidatePlusSigns(newParts);

    let oldDiffHtml = '';
    let newDiffHtml = '';
    
    const numSegments = Math.min(consolidatedOldParts.length, consolidatedNewParts.length);
    
    for (let i = 0; i < numSegments; i++) {
        const oldSegment = consolidatedOldParts[i];
        const newSegment = consolidatedNewParts[i];
        
        // Identify a phone number: MUST contain at least one digit in the normalized form.
        const isPhoneNumber = /\d/.test(normalize(oldSegment));

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
            // FIX: Only use char diffing if the delimiters are the same to preserve common 
            // parts like ';' that remain. Otherwise, mark old fully removed/new fully added.

            if (oldSegment.trim() === newSegment.trim()) {
                // Delimiter character is the same (e.g., both are ';'), only whitespace changes.
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
            } else {
                // Delimiter character has changed (e.g., ' / ' to '; '). Full removal/addition is clearer.
                oldDiffHtml += `<span class="diff-removed">${oldSegment}</span>`;
                newDiffHtml += `<span class="diff-added">${newSegment}</span>`;
            }
        }
    }

    // Append any trailing parts
    oldDiffHtml += consolidatedOldParts.slice(numSegments).join('');
    newDiffHtml += consolidatedNewParts.slice(numSegments).join('');

    return { oldDiff: oldDiffHtml, newDiff: newDiffHtml };
}

module.exports = { 
    normalize, 
    consolidatePlusSigns, 
    diffPhoneNumbers, 
    getDiffHtml,
    UNIVERSAL_SPLIT_CAPTURE_REGEX, 
    NEW_SPLIT_CAPTURE_REGEX 
};
