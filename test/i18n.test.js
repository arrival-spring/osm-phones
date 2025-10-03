const fs = require('fs');
const path = require('path');
const { MASTER_KEYS } = require('./i18n.master');

// Helper to load all translation files
const localesDir = path.join(__dirname, '../locales');
const translationFiles = fs.readdirSync(localesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => ({
        locale: file.replace('.json', ''),
        content: require(path.join(localesDir, file))
    }));

// List of all expected keys
const masterKeys = Object.keys(MASTER_KEYS);

// Regex to find ANY placeholder (%letter)
const PLACEHOLDER_REGEX = /%[a-z]/g;

// Regex to find common, disallowed HTML characters (e.g., <, >, &, ", ')
// Note: This regex *allows* the permitted control sequence '&shy;' for the "phoneNumberReport" key.
const DISALLOWED_HTML_REGEX = /[<>"']/g; // Catches <, >, ", '
const DISALLOWED_HTML_AMPERSAND_REGEX = /&(?!shy;)/g; // Catches '&' unless followed by 'shy;'

describe('Localization File Integrity Tests', () => {

    // Test 1: Check for missing or extra keys in all locale files
    translationFiles.forEach(({ locale, content }) => {
        const currentKeys = Object.keys(content);

        test(`[${locale}] must contain all master keys and no extra keys`, () => {
            // Check for missing keys
            const missingKeys = masterKeys.filter(key => !currentKeys.includes(key));
            expect(missingKeys).toEqual([]);

            // Check for extra keys
            const extraKeys = currentKeys.filter(key => !masterKeys.includes(key));
            expect(extraKeys).toEqual([]);
        });
    });

    // Test 2: Check for correct placeholder usage in all locale files
    translationFiles.forEach(({ locale, content }) => {

        test(`[${locale}] must use correct placeholders for all keys`, () => {

            // This array will collect all placeholder errors for this locale
            const placeholderErrors = [];

            masterKeys.forEach(key => {
                const requiredPlaceholders = MASTER_KEYS[key];
                const translationString = content[key];

                // Skip if the key is missing (already caught by Test 1, but for safety)
                if (!translationString) return;

                // Find all placeholders used in the current translation string
                const actualPlaceholders = (translationString.match(PLACEHOLDER_REGEX) || [])
                    .map(p => p.toLowerCase()); // Ensure consistent case

                // Check for missing required placeholders
                requiredPlaceholders.forEach(requiredP => {
                    if (!actualPlaceholders.includes(requiredP)) {
                        placeholderErrors.push({
                            key,
                            type: 'MISSING',
                            placeholder: requiredP,
                            translation: translationString
                        });
                    }
                });

                // Check for unexpected/extra placeholders
                actualPlaceholders.forEach(actualP => {
                    if (!requiredPlaceholders.includes(actualP)) {
                        placeholderErrors.push({
                            key,
                            type: 'EXTRA',
                            placeholder: actualP,
                            translation: translationString
                        });
                    }
                });
            });

            // If the error array is not empty, fail the test and show the details
            expect(placeholderErrors).toEqual([]);
        });
    });

    // Test 3: Check for disallowed HTML characters in all locale files
    translationFiles.forEach(({ locale, content }) => {

        test(`[${locale}] must not contain disallowed HTML characters`, () => {
            const htmlErrors = [];

            masterKeys.forEach(key => {
                const translationString = content[key];

                // Skip if the key is missing
                if (!translationString) return;

                // Check for general disallowed characters: <, >, ", '
                const generalMatches = translationString.match(DISALLOWED_HTML_REGEX);
                if (generalMatches) {
                    htmlErrors.push({
                        key,
                        type: 'DISALLOWED_CHARACTERS',
                        characters: generalMatches.join(''),
                        translation: translationString
                    });
                    // Once a general match is found, skip the ampersand check for this string
                    return;
                }

                // Check for ampersands '&' that are NOT followed by 'shy;'
                const ampersandMatches = translationString.match(DISALLOWED_HTML_AMPERSAND_REGEX);
                if (ampersandMatches) {
                    htmlErrors.push({
                        key,
                        type: 'DISALLOWED_AMPERSAND',
                        // Report the raw match which will be '&'
                        characters: ampersandMatches.join(''),
                        translation: translationString
                    });
                }
            });

            // If the error array is not empty, fail the test and show the details
            expect(htmlErrors).toEqual([]);
        });
    });
});