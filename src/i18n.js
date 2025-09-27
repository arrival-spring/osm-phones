// i18n.js
const fs = require('fs');
const path = require('path');

const locales = {};
const LOCALE_DIR = path.join(__dirname, '../locales');
const DEFAULT_LOCALE = 'en';

// Load all translation files
try {
    const files = fs.readdirSync(LOCALE_DIR);
    files.forEach(file => {
        if (file.endsWith('.json')) {
            const locale = file.replace('.json', '');
            locales[locale] = JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, file), 'utf8'));
        }
    });
} catch (error) {
    console.error(`Could not load locales from ${LOCALE_DIR}:`, error);
}

/**
 * Gets a translated string for a given key and locale, with optional placeholders.
 * @param {string} key - The key in the JSON file.
 * @param {string} locale - The target locale.
 * @param {Array<string>} [args=[]] - Array of strings for positional placeholders.
 * @returns {string} The translated string.
 */
function translate(key, locale, args = []) {
    const translation = locales[locale]?.[key] || locales[DEFAULT_LOCALE]?.[key] || `MISSING_KEY:${key}`;

    let output = translation;

    if (key === 'invalidNumbersOutOf' && args.length === 2) {
        // Positional replacement: %s is fixable, %t is total
        output = output.replace('%s', args[0]).replace('%t', args[1]);
    } else if ((key === 'invalidPercentageOfTotal' || key === 'fixablePercentageOfInvalid') && args.length === 1) {
        output = output.replace('%p', args[0]);
    } else if (key === 'reportSubtitleForCountry' && args.length === 1) {
        // Positional replacement: %c is country name
        output = output.replace('%c', args[0]);
    }
    
    // Handle Time Ago templates (using %n)
    if ((key.startsWith('timeAgo') && key !== 'timeAgoJustNow' && key !== 'timeAgoError') && args.length === 1) {
        // args[0] is the number
        output = output.replace('%n', args[0]);
    } else if (key === 'dataSourcedTemplate' && args.length === 4) {
        // Positional replacement: %d=Date, %t=Time, %z=Timezone, %a=TimeAgo (the <span> element)
        output = output.replace('%d', args[0])
                       .replace('%t', args[1])
                       .replace('%z', args[2])
                       .replace('%a', args[3]);
    }

    // Note: All other keys do not use positional args.

    return output;
}

module.exports = { translate };