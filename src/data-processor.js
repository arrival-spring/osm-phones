const { parsePhoneNumber } = require('libphonenumber-js');

/**
 * Creates a safe, slug-like name for filenames.
 * @param {string} name
 * @returns {string}
 */
function safeName(name) {
    return name.replace(/\s+|\//g, '-').toLowerCase();
}

/**
 * Determines a readable feature name from OSM tags.
 * @param {Array<Object>} item - An array of an OSM objects including allTags.
 * @returns {string}
 */
function getFeatureTypeName(item) {
    if (item.name) {
        return `${item.name}`;
    }

    const featureTags = ['amenity', 'shop', 'tourism', 'leisure', 'emergency', 'building', 'craft', 'aeroway', 'railway', 'healthcare', 'highway', 'military', 'man_made', 'public_transport'];
    let featureType = null;
    for (const tag of featureTags) {
        if (item.allTags[tag]) {
            featureType = item.allTags[tag];
            break;
        }
    }

    if (featureType) {
        const formattedType = featureType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `${formattedType}`;
    } else {
        const formattedType = item.type.replace(/\b\w/g, c => c.toUpperCase());
        return `OSM ${formattedType}`;
    }
}

/**
 * Strips phone number extensions (x, ext, etc.) and non-dialable characters 
 * to isolate the core number for comparison.
 * @param {string} numberStr 
 * @returns {string} The core number string without the extension.
 */
function stripExtension(numberStr) {
    // Regex matches common extension prefixes: x, ext, extension, etc.
    // It captures everything before the extension marker.
    const extensionRegex = /^(.*?)(?:[xX]|[eE][xX][tT]|\s*\(ext\)\s*).*$/;
    const match = numberStr.match(extensionRegex);

    // If an extension is found, return the part before it (trimmed).
    if (match && match[1]) {
        return match[1].trim();
    }
    // Otherwise, return the original string.
    return numberStr;
}

/**
 * Validates a single phone number string using libphonenumber-js.
 * @param {string} numberStr - The phone number string to validate.
 * @param {string} countryCode - The country code for validation.
 * @returns {{isInvalid: boolean, suggestedFix: string, autoFixable: boolean}}
 */
function processSingleNumber(numberStr, countryCode) {
    let suggestedFix = 'No fix available';
    let autoFixable = true;
    let isInvalid = false;

    const NON_STANDARD_EXT_PREFIX_REGEX = /([eE][xX][tT])|(\s*\([eE][xX][tT]\)\s*)/;
    const hasNonStandardExtension = NON_STANDARD_EXT_PREFIX_REGEX.test(numberStr);

    try {
        const phoneNumber = parsePhoneNumber(numberStr, countryCode);

        // Strip the extension from the original string for normalization
        const numberToValidate = stripExtension(numberStr);
        const normalizedOriginal = numberToValidate.replace(/\s/g, '');

        let normalizedParsed = '';

        if (phoneNumber) {
            // The suggested fix should include the original extension if one exists.
            const extension = phoneNumber.ext ? ` x${phoneNumber.ext}` : '';
            suggestedFix = phoneNumber.format('INTERNATIONAL') + extension;
        }

        if (phoneNumber && phoneNumber.isValid()) {
            normalizedParsed = phoneNumber.number.replace(/\s/g, '');

            isInvalid = normalizedOriginal !== normalizedParsed;

            if (phoneNumber.ext && hasNonStandardExtension) {
                isInvalid = true;
            }
        } else {
            // The number is fundamentally invalid (e.g., too few digits)
            isInvalid = true;
            autoFixable = false;
        }
    } catch (e) {
        // Parsing failed due to an exception (unfixable invalid number)
        isInvalid = true;
        autoFixable = false;
        suggestedFix = 'No fix available';
    }

    return { isInvalid, suggestedFix, autoFixable };
}

/**
 * Validates phone numbers using libphonenumber-js, marking tags as invalid if
 * they contain bad separators (comma, slash, 'or') or invalid numbers.
 * @param {Array<Object>} elements - OSM elements with phone tags.
 * @param {string} countryCode - The country code for validation.
 * @returns {{invalidNumbers: Array<Object>, totalNumbers: number}}
 */
function validateNumbers(elements, countryCode) {
    const invalidItemsMap = new Map();
    let totalNumbers = 0;

    // Define the regex for separators that are definitively "bad" and should trigger a fix report.
    const BAD_SEPARATOR_REGEX = /(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

    // This regex is used for splitting. It catches ALL valid and invalid separators:
    // Raw semicolon (';'), semicolon with optional space ('; ?'), comma, slash, 'or' or 'and'.
    const UNIVERSAL_SPLIT_REGEX = /(?:; ?)|(?:\s*,\s*)|(?:\s*\/\s*)|(?:\s+or\s+)|(?:\s+and\s+)/gi;

    elements.forEach(element => {
        if (element.tags) {
            const tags = element.tags;
            const phoneTags = ['phone', 'contact:phone'];
            const websiteTags = ['website', 'contact:website'];

            let website = websiteTags.map(tag => tags[tag]).find(url => url);
            if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
                website = `http://${website}`; // Otherwise it won't be clickable later
            }

            const lat = element.lat || (element.center && element.center.lat);
            const lon = element.lon || (element.center && element.center.lon);
            const name = tags.name;
            const key = `${element.type}-${element.id}`;
            const baseItem = {
                type: element.type,
                id: element.id,
                osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
                tag: null,
                website: website,
                lat: lat,
                lon: lon,
                name: name,
                allTags: tags,
                invalidNumbers: '',
                suggestedFixes: [],
            };

            for (const tag of phoneTags) {
                if (tags[tag]) {
                    const originalTagValue = tags[tag].trim();

                    // Check if a bad separator was used
                    const hasBadSeparator = originalTagValue.match(BAD_SEPARATOR_REGEX);

                    // Single-step splitting: The regex finds all separators and removes them.
                    const numbers = originalTagValue
                        .split(UNIVERSAL_SPLIT_REGEX)
                        .map(s => s.trim())
                        .filter(s => s.length > 0);

                    const suggestedNumbersList = [];
                    let hasIndividualInvalidNumber = false;

                    numbers.forEach(numberStr => {
                        totalNumbers++;

                        const validationResult = processSingleNumber(numberStr, countryCode);
                        const { isInvalid, suggestedFix, autoFixable } = validationResult;

                        suggestedNumbersList.push(suggestedFix);

                        if (isInvalid) {
                            hasIndividualInvalidNumber = true;

                            if (!invalidItemsMap.has(key)) {
                                invalidItemsMap.set(key, { ...baseItem, tag: tag, autoFixable: true });
                            }
                            const item = invalidItemsMap.get(key);

                            item.invalidNumbers = originalTagValue;

                            if (!autoFixable) {
                                item.autoFixable = false;
                            }
                        }
                    });

                    // Final check for invalidity due to bad separators
                    if (hasIndividualInvalidNumber || hasBadSeparator) {

                        const suggestedTagValue = suggestedNumbersList.join('; ');

                        if (!invalidItemsMap.has(key)) {
                            const isAutoFixable = !hasIndividualInvalidNumber;
                            invalidItemsMap.set(key, { ...baseItem, tag: tag, autoFixable: isAutoFixable });
                        }
                        const item = invalidItemsMap.get(key);

                        item.suggestedFixes.push(suggestedTagValue);

                        if (hasBadSeparator) {
                            item.invalidNumbers = originalTagValue;
                            item.autoFixable = item.autoFixable === false ? false : true;
                        }
                    }
                }
            }
        }
    });

    return { invalidNumbers: Array.from(invalidItemsMap.values()), totalNumbers };
}

module.exports = {
    safeName,
    validateNumbers,
    getFeatureTypeName,
    stripExtension,
    processSingleNumber
};
