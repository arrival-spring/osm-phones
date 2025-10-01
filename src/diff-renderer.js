/**
 * Removes all non-digit characters from a string to create a normalized phone number.
 * @param {string} phoneNumber - The phone number string to normalize.
 * @returns {string} The normalized phone number string (digits only).
 */
const normalize = (phoneNumber) => {
    // Remove all characters that are not digits (0-9)
    return phoneNumber.replace(/\D/g, '');
};

/**
 * A private helper function to convert the diff array segments into HTML spans.
 * @param {{value: string, removed?: boolean, added?: boolean}[]} diffSegments
 * @returns {string} The HTML string.
 */
const convertToHtml = (diffSegments) => {
    return diffSegments.map(p => {
        let className = 'diff-unchanged';
        if (p.removed) {
            className = 'diff-removed';
        } else if (p.added) {
            className = 'diff-added';
        }
        // If no status is set, it defaults to 'diff-unchanged'
        return `<span class="${className}">${p.value}</span>`;
    }).join('');
};

/**
 * Simple LCS diff for two strings (used for separators).
 * @param {string} original
 * @param {string} suggested
 * @returns {{original: {value: string, removed?: boolean, added?: boolean}[], suggested: {value: string, removed?: boolean, added?: boolean}[]}}
 */
const simpleLCSDiff = (original, suggested) => {
    // A simplified LCS calculation (only for characters, no need for common digits tracking)
    const dp = Array(original.length + 1).fill(0).map(() => Array(suggested.length + 1).fill(0));
    for (let i = 1; i <= original.length; i++) {
        for (let j = 1; j <= suggested.length; j++) {
            if (original[i - 1] === suggested[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const originalDiff = [];
    const suggestedDiff = [];
    let i = original.length;
    let j = suggested.length;

    // Backtrack to build the diff
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && original[i - 1] === suggested[j - 1]) {
            // Unchanged
            originalDiff.unshift({ value: original[i - 1] });
            suggestedDiff.unshift({ value: suggested[j - 1] });
            i--;
            j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            // Added to suggested (S)
            suggestedDiff.unshift({ value: suggested[j - 1], added: true });
            j--;
        } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
            // Removed from original (O)
            originalDiff.unshift({ value: original[i - 1], removed: true });
            i--;
        }
    }

    return { original: originalDiff, suggested: suggestedDiff };
};

/**
 * Compares two single phone numbers (original and suggested) and produces two arrays
 * of diff segments, preserving the original formatting while highlighting changes.
 *
 * The logic uses Longest Common Subsequence (LCS) on the normalized (digit-only) strings
 * to guide the alignment of the formatted strings.
 *
 * @param {string} original - The original formatted phone number.
 * @param {string} suggested - The suggested formatted phone number.
 * @returns {{originalDiff: {value: string, removed?: boolean}[], suggestedDiff: {value: string, added?: boolean}[]}}
 */
const diffPhoneNumbers = (original, suggested) => {
    const normOriginal = normalize(original);
    const normSuggested = normalize(suggested);

    let originalDiff = [];
    let suggestedDiff = [];

    // Helper to check if a char is a digit
    const isDigit = (char) => /\d/.test(char);

    // A simple digit-based LCS to determine the common *digits*
    const getCommonDigits = (oNorm, sNorm) => {
        let common = '';
        const dp = Array(oNorm.length + 1).fill(0).map(() => Array(sNorm.length + 1).fill(0));
        for (let i = 1; i <= oNorm.length; i++) {
            for (let j = 1; j <= sNorm.length; j++) {
                if (oNorm[i - 1] === sNorm[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        let i = oNorm.length;
        let j = sNorm.length;
        while (i > 0 && j > 0) {
            if (oNorm[i - 1] === sNorm[j - 1]) {
                common = oNorm[i - 1] + common;
                i--;
                j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return common;
    };

    const commonDigits = getCommonDigits(normOriginal, normSuggested);

    let oFmtIdx = 0;
    let sFmtIdx = 0;
    let oNormIdx = 0; // Tracks position in normOriginal
    let sNormIdx = 0; // Tracks position in normSuggested
    let commonPtr = 0; // Tracks position in commonDigits

    while (oFmtIdx < original.length || sFmtIdx < suggested.length) {
        const oChar = original[oFmtIdx];
        const sChar = suggested[sFmtIdx];
        const oIsDigit = oFmtIdx < original.length && isDigit(oChar);
        const sIsDigit = sFmtIdx < suggested.length && isDigit(sChar);

        let consumed = false;

        // Determine if the current formatted digit is the next one expected in the LCS path
        const oIsNextCommonDigit = oIsDigit && commonPtr < commonDigits.length && oChar === commonDigits[commonPtr] && oChar === normOriginal[oNormIdx];
        const sIsNextCommonDigit = sIsDigit && commonPtr < commonDigits.length && sChar === commonDigits[commonPtr] && sChar === normSuggested[sNormIdx];

        // --- 1. Aligned Common Digits ---
        if (oIsNextCommonDigit && sIsNextCommonDigit) {
            originalDiff.push({ value: oChar });
            suggestedDiff.push({ value: sChar });
            commonPtr++;
            oNormIdx++;
            sNormIdx++;
            oFmtIdx++;
            sFmtIdx++;
            consumed = true;
        }

        // --- 2. Aligned Identical Formatting ---
        // FIX: Only align formatting if the normalized indices are also aligned. 
        // This ensures formatting is marked removed/added if the prefix/digit grouping changed.
        else if (oFmtIdx < original.length && sFmtIdx < suggested.length && !oIsDigit && !sIsDigit && oChar === sChar && oNormIdx === sNormIdx) {
            originalDiff.push({ value: oChar });
            suggestedDiff.push({ value: sChar });
            oFmtIdx++;
            sFmtIdx++;
            consumed = true;
        }

        // --- 3. Independent Consumption (Removed/Added blocks) ---
        else {

            // Priority O: Consume O if it has content that is NOT common, OR S is waiting on its common digit.
            const oShouldConsume = oFmtIdx < original.length && (
                sFmtIdx >= suggested.length || // S exhausted
                (oIsDigit && !oIsNextCommonDigit) || // O is a digit that must be removed
                (oIsDigit && commonPtr >= commonDigits.length) || // O is digit after LCS is exhausted
                (!oIsDigit && sIsNextCommonDigit) // O is formatting preceding S's common digit
            );

            // Priority S: Consume S if it has content that is NOT common, OR O is waiting on its common digit.
            const sShouldConsume = sFmtIdx < suggested.length && (
                oFmtIdx >= original.length || // O exhausted
                (sIsDigit && !sIsNextCommonDigit) || // S is a digit that must be added
                (sIsDigit && commonPtr >= commonDigits.length) || // S is digit after LCS is exhausted
                (!sIsDigit && oIsNextCommonDigit) // S is formatting preceding O's common digit
            );

            if (oShouldConsume && !sShouldConsume) {
                 originalDiff.push({ value: oChar, removed: true });
                 if (oIsDigit) oNormIdx++;
                 oFmtIdx++;
                 consumed = true;
            } else if (sShouldConsume && !oShouldConsume) {
                 suggestedDiff.push({ value: sChar, added: true });
                 if (sIsDigit) sNormIdx++;
                 sFmtIdx++;
                 consumed = true;
            } else if (oFmtIdx < original.length && sFmtIdx < suggested.length && !oIsNextCommonDigit && !sIsNextCommonDigit) {
                 // Fallback for character mismatch (O: 'a', S: 'b') where neither is the next common digit.
                 // This block also handles identical non-LCS characters that fail the oNormIdx check in Rule 2.
                 originalDiff.push({ value: oChar, removed: true });
                 suggestedDiff.push({ value: sChar, added: true });
                 if (oIsDigit) oNormIdx++;
                 if (sIsDigit) sNormIdx++;
                 oFmtIdx++;
                 sFmtIdx++;
                 consumed = true;
            } else {
                 // Final end-of-string consumption (catches remaining characters)
                 if (oFmtIdx < original.length) {
                     originalDiff.push({ value: original[oFmtIdx], removed: true });
                     if (isDigit(original[oFmtIdx])) oNormIdx++;
                     oFmtIdx++;
                     consumed = true;
                 } else if (sFmtIdx < suggested.length) {
                     suggestedDiff.push({ value: suggested[sFmtIdx], added: true });
                     if (isDigit(suggested[sFmtIdx])) sNormIdx++;
                     sFmtIdx++;
                     consumed = true;
                 }
            }
        }
    }

    return {
        originalDiff: originalDiff,
        suggestedDiff: suggestedDiff,
    };
};

/**
 * Compares two potentially multi-number strings and returns the HTML-diffed strings.
 * It handles splitting the strings into individual numbers and separators,
 * and calls diffPhoneNumbers for the number segments.
 *
 * @param {string} original - The original string (may contain multiple numbers).
 * @param {string} suggested - The suggested string (may contain multiple numbers).
 * @returns {{oldDiff: string, newDiff: string}} The HTML-diffed strings.
 */
const getDiffHtml = (original, suggested) => {
    // FIX: Update splitter to only target known multi-number separators (;, /, etc.) to avoid 
    // incorrectly splitting internal number formatting like "+90 0123" (Test 3 failure).
    // The regex captures the common multi-number separators: semicolon, comma, or slash.
    const splitter = /( *; *| *, *| *\/ *)/g;

    // Split and keep delimiters
    const originalParts = original.split(splitter);
    const suggestedParts = suggested.split(splitter);

    // Filter out empty strings that result from splits, ensuring we maintain Number, Separator, Number, Separator... structure
    const oSegments = originalParts.filter((_, i) => (i % 2 === 0 && originalParts[i].trim().length > 0) || i % 2 !== 0);
    const sSegments = suggestedParts.filter((_, i) => (i % 2 === 0 && suggestedParts[i].trim().length > 0) || i % 2 !== 0);

    // Pad the shorter array with empty strings for alignment
    const maxLength = Math.max(oSegments.length, sSegments.length);
    while (oSegments.length < maxLength) oSegments.push('');
    while (sSegments.length < maxLength) sSegments.push('');

    let oldDiffHtml = '';
    let newDiffHtml = '';

    for (let i = 0; i < maxLength; i++) {
        const oSeg = oSegments[i].trim();
        const sSeg = sSegments[i].trim();

        // Segments alternate between number (index 0, 2, 4...) and separator (index 1, 3, 5...)
        const isSeparator = i % 2 !== 0;

        if (!isSeparator) {
            // --- NUMBER DIFF ---
            if (oSeg.length > 0 || sSeg.length > 0) {
                const diffResult = diffPhoneNumbers(oSeg, sSeg);
                oldDiffHtml += convertToHtml(diffResult.originalDiff);
                newDiffHtml += convertToHtml(diffResult.suggestedDiff);
            }
        } else {
            // --- SEPARATOR DIFF ---
            if (oSeg.length > 0 || sSeg.length > 0) {
                const separatorDiffResult = simpleLCSDiff(oSeg, sSeg);
                oldDiffHtml += convertToHtml(separatorDiffResult.original);
                newDiffHtml += convertToHtml(separatorDiffResult.suggested);
            }
        }
    }

    return {
        oldDiff: oldDiffHtml,
        newDiff: newDiffHtml
    };
};

module.exports = {
    normalize,
    diffPhoneNumbers,
    getDiffHtml
};
