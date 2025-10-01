/**
 * Computes the Longest Common Subsequence (LCS) table.
 * @param {string} oldStr
 * @param {string} newStr
 * @returns {Array<Array<number>>}
 */
function getLcsTable(oldStr, newStr) {
    const oldLen = oldStr.length;
    const newLen = newStr.length;
    const table = Array(oldLen + 1).fill(null).map(() => Array(newLen + 1).fill(0));

    for (let i = 1; i <= oldLen; i++) {
        for (let j = 1; j <= newLen; j++) {
            if (oldStr[i - 1] === newStr[j - 1]) {
                table[i][j] = table[i - 1][j - 1] + 1;
            } else {
                table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
            }
        }
    }
    return table;
}

/**
 * Generates a diff of two strings using the LCS algorithm.
 * The output is an HTML string with <ins> and <del> tags.
 * @param {string} oldStr
 * @param {string} newStr
 * @returns {string}
 */
function diffStrings(oldStr, newStr) {
    const table = getLcsTable(oldStr, newStr);
    let i = oldStr.length;
    let j = newStr.length;
    const result = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
            result.unshift(oldStr[i - 1]);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
            result.unshift(`<ins>${newStr[j - 1]}</ins>`);
            j--;
        } else if (i > 0 && (j === 0 || table[i][j - 1] < table[i - 1][j])) {
            result.unshift(`<del>${oldStr[i - 1]}</del>`);
            i--;
        } else {
            break; // Should not happen
        }
    }

    return result.join('');
}

module.exports = {
    diffStrings
};