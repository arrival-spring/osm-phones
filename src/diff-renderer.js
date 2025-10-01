const Diff = require('diff');

/**
 * Creates an HTML string with diff highlighting for two strings.
 * @param {string} oldString - The original string.
 * @param {string} newString - The new string.
 * @returns {{oldDiff: string, newDiff: string}} - An object containing the HTML for both diffs.
 */
function getDiffHtml(oldString, newString) {
  const diff = Diff.diffChars(oldString, newString);
  let oldDiff = '';
  let newDiff = '';

  diff.forEach((part) => {
    const colorClass = part.added ? 'diff-added' :
      part.removed ? 'diff-removed' : 'diff-unchanged';

    if (part.added) {
      newDiff += `<span class="${colorClass}">${part.value}</span>`;
    } else if (part.removed) {
      oldDiff += `<span class="${colorClass}">${part.value}</span>`;
    } else {
      oldDiff += `<span class="${colorClass}">${part.value}</span>`;
      newDiff += `<span class="${colorClass}">${part.value}</span>`;
    }
  });

  return { oldDiff, newDiff };
}

module.exports = { getDiffHtml };