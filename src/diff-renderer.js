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
 * Merges a lone '+' sign segment with the subsequent segment in an array of string segments.
 * This is useful when splitting a string by separators that might include a space before the '+' sign.
 * @param {string[]} segments - An array of string segments (numbers or separators).
 * @returns {string[]} The consolidated array of segments.
 */
const consolidatePlusSigns = (segments) => {
    const result = [];
    for (let i = 0; i < segments.length; i++) {
        // Check for a lone '+' followed by another segment (which is likely the number itself)
        if (segments[i] === '+' && i + 1 < segments.length) {
            // Merge them: '+32 58 515 592'
            result.push(segments[i] + segments[i + 1]);
            i++; // Skip the next segment as it has been merged
        } else {
            result.push(segments[i]);
        }
    }
    return result;
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
 * Compares two single phone numbers (original and suggested) and produces two arrays
 * of diff segments, preserving the original formatting while highlighting changes.
 *
 * The logic is based on digit alignment:
 * 1. Determine which digits were added/removed/unchanged based on normalized strings.
 * 2. Map this status back to the formatted strings, handling formatting characters:
 * - Formatting near added/removed digits is also marked added/removed.
 * - Formatting near unchanged digits is marked added/removed only if it's new/missing.
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

    // Pointers for normalized strings
    let oNormIdx = 0;
    let sNormIdx = 0;

    // Pointers for formatted strings
    let oFmtIdx = 0;
    let sFmtIdx = 0;

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
    
    // Pointers for the common digit sequence
    let commonPtr = 0;

    while (oFmtIdx < original.length || sFmtIdx < suggested.length) {
        const oChar = original[oFmtIdx];
        const sChar = suggested[sFmtIdx];
        const oIsDigit = oFmtIdx < original.length && /\d/.test(oChar);
        const sIsDigit = sFmtIdx < suggested.length && /\d/.test(sChar);

        // --- 1. Aligned Common Digits ---
        if (oIsDigit && sIsDigit && commonPtr < commonDigits.length && oChar === commonDigits[commonPtr] && sChar === commonDigits[commonPtr]) {
            // Unchanged digit
            originalDiff.push({ value: oChar });
            suggestedDiff.push({ value: sChar });
            oNormIdx++;
            sNormIdx++;
            oFmtIdx++;
            sFmtIdx++;
            commonPtr++;
            continue;
        }

        // --- 2. Consume Original Side (Removed/Formatting changes) ---
        if (oFmtIdx < original.length) {
            if (oIsDigit) {
                // Digit is not part of the common sequence (must be a removed prefix/suffix digit)
                originalDiff.push({ value: oChar, removed: true });
                oNormIdx++;
                oFmtIdx++;
                continue;
            } else {
                // Formatting in O
                // Check if it is aligned/unchanged formatting (e.g., spaces in Test 2)
                if (sFmtIdx < suggested.length && sChar === oChar && !sIsDigit && commonPtr === commonDigits.length) {
                    // Aligned formatting in the tail end (or prefix if commonPtr is 0 and sFmtIdx < suggested.length)
                    originalDiff.push({ value: oChar });
                    suggestedDiff.push({ value: sChar });
                    oFmtIdx++;
                    sFmtIdx++;
                    continue;
                } else {
                    // Non-aligned or mismatch formatting (Test 1 spaces, Test 2 '(', ')')
                    originalDiff.push({ value: oChar, removed: true });
                    oFmtIdx++;
                    continue;
                }
            }
        }

        // --- 3. Consume Suggested Side (Added changes) ---
        if (sFmtIdx < suggested.length) {
            if (sIsDigit) {
                // Digit is not part of the common sequence (must be an added prefix/suffix digit)
                suggestedDiff.push({ value: sChar, added: true });
                sNormIdx++;
                sFmtIdx++;
                continue;
            } else {
                // Formatting in S (must be added formatting)
                suggestedDiff.push({ value: sChar, added: true });
                sFmtIdx++;
                continue;
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
    // Split by common separators (non-digit, non-plus characters) while capturing them
    const splitter = /([^\d+]+)/g;

    const originalSegments = original.split(splitter).filter(Boolean);
    const suggestedSegments = suggested.split(splitter).filter(Boolean);

    // Apply consolidation for lone '+' signs (Test helper requirement)
    const oSegments = consolidatePlusSigns(originalSegments);
    const sSegments = consolidatePlusSigns(suggestedSegments);

    // Pad the shorter array with empty strings for alignment
    const maxLength = Math.max(oSegments.length, sSegments.length);
    while (oSegments.length < maxLength) oSegments.push('');
    while (sSegments.length < maxLength) sSegments.push('');

    let oldDiffHtml = '';
    let newDiffHtml = '';

    for (let i = 0; i < maxLength; i++) {
        const oSeg = oSegments[i];
        const sSeg = sSegments[i];

        // Segments alternate between number (index 0, 2, 4...) and separator (index 1, 3, 5...)
        const isSeparator = i % 2 !== 0;

        if (!isSeparator) {
            // --- NUMBER DIFF ---
            if (oSeg.length > 0 && sSeg.length > 0) {
                const diffResult = diffPhoneNumbers(oSeg, sSeg);
                oldDiffHtml += convertToHtml(diffResult.originalDiff);
                newDiffHtml += convertToHtml(diffResult.suggestedDiff);
            } else if (oSeg.length > 0) {
                // Number removed
                oldDiffHtml += convertToHtml(oSeg.split('').map(char => ({ value: char, removed: true })));
            } else if (sSeg.length > 0) {
                // Number added
                newDiffHtml += convertToHtml(sSeg.split('').map(char => ({ value: char, added: true })));
            }
        } else {
            // --- SEPARATOR DIFF ---
            // Perform a simple character-by-character diff (LCS approximation) for the separator
            let oTempHtml = '';
            let sTempHtml = '';
            let ptr = 0;
            const minLen = Math.min(oSeg.length, sSeg.length);

            // Aligned characters are unchanged
            while (ptr < minLen && oSeg[ptr] === sSeg[ptr]) {
                oTempHtml += convertToHtml([{ value: oSeg[ptr] }]);
                sTempHtml += convertToHtml([{ value: sSeg[ptr] }]);
                ptr++;
            }

            // Remaining O is removed
            for (let j = ptr; j < oSeg.length; j++) {
                oTempHtml += convertToHtml([{ value: oSeg[j], removed: true }]);
            }
            // Remaining S is added
            for (let j = ptr; j < sSeg.length; j++) {
                sTempHtml += convertToHtml([{ value: sSeg[j], added: true }]);
            }

            oldDiffHtml += oTempHtml;
            newDiffHtml += sTempHtml;
        }
    }

    return {
        oldDiff: oldDiffHtml,
        newDiff: newDiffHtml
    };
};

module.exports = {
    normalize,
    consolidatePlusSigns,
    diffPhoneNumbers,
    getDiffHtml
};
