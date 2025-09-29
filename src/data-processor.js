const { parsePhoneNumber } = require('libphonenumber-js');
const { FEATURE_TAGS, HISTORIC_AND_DISUSED_PREFIXES, EXCLUSIONS, PHONE_TAGS, WEBSITE_TAGS } = require('./constants');

/**
 * Creates a safe, slug-like name for filenames.
 * @param {string} name
 * @returns {string}
 */
function safeName(name) {
    return name.replace(/\s+|\//g, '-').toLowerCase();
}

/**
 * Determines if an OSM feature should be considered disused.
 * @param {Array<Object>} item - An array of an OSM objects including allTags.
 * @returns {boolean}
 */
function isDisused(item) {
    const featureType = getFeatureType(item);
    if (featureType) {
        return false
    }

    for (const prefix of HISTORIC_AND_DISUSED_PREFIXES) {
        for (const tag of FEATURE_TAGS) {
            if (item.allTags[`${prefix}:${tag}`]) {
                return true
            }
        }
    }
    return false
}

/**
 * Determines a name from OSM tags or null if one cannot be determined.
 * @param {Array<Object>} item - An array of an OSM objects including allTags.
 * @returns {string}
 */
function getFeatureType(item) {
    for (const tag of FEATURE_TAGS) {
        if (item.allTags[tag]) {
            return item.allTags[tag];
        }
    }
    // If nothing was found then look in at disused prefixes
    // (disused label will be applied anyway)
    for (const prefix of HISTORIC_AND_DISUSED_PREFIXES) {
        for (const tag of FEATURE_TAGS) {
            if (item.allTags[`${prefix}:${tag}`]) {
                return item.allTags[tag];
            }
        }
    }
    return null
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
    
    const featureType = getFeatureType(item);

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
 * Checks if a parsed phone number matches any defined exclusions based on country 
 * code and OSM tags.
 * * @param {Object} phoneNumber - The parsed phone number object from libphonenumber-js.
 * @param {string} countryCode - The country code.
 * @param {Object} osmTags - The OpenStreetMap tags associated with the number.
 * @returns {Object|null} - Returns an object with { isInvalid: false, autoFixable: true, suggestedFix } 
 * if an exclusion is matched, otherwise returns null.
 */
function checkExclusions(phoneNumber, countryCode, osmTags) {
    if (!phoneNumber) {
        return null;
    }
    
    const countryExclusions = EXCLUSIONS[countryCode];

    if (countryExclusions) {
        // Get the core national number without country code
        const coreNationalNumber = phoneNumber.nationalNumber;
        const numberExclusions = countryExclusions[coreNationalNumber];

        if (numberExclusions) {
            // Check if all required OSM tag key/value pair matches the input osmTags
            for (const key in numberExclusions) {
                if (numberExclusions.hasOwnProperty(key)) {
                    if (osmTags[key] === numberExclusions[key]) {
                        return {
                            isInvalid: false,
                            autoFixable: true,
                            suggestedFix: coreNationalNumber
                        };
                    }
                }
            }
        }
    }
    
    return null;
}

/**
 * Validates a single phone number string using libphonenumber-js.
 * @param {string} numberStr - The phone number string to validate.
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @returns {{isInvalid: boolean, suggestedFix: string, autoFixable: boolean}}
 */
function processSingleNumber(numberStr, countryCode, osmTags = {}) {
    let suggestedFix = 'No fix available';
    let autoFixable = true;
    let isInvalid = false;

    const NON_STANDARD_EXT_PREFIX_REGEX = /([eE][xX][tT])|(\s*\([eE][xX][tT]\)\s*)/;
    const hasNonStandardExtension = NON_STANDARD_EXT_PREFIX_REGEX.test(numberStr);

    try {
        const phoneNumber = parsePhoneNumber(numberStr, countryCode);

        const exclusionResult = checkExclusions(phoneNumber, countryCode, osmTags);
        if (exclusionResult) {
            return exclusionResult;
        }

        // Strip the extension from the original string for normalization
        const numberToValidate = stripExtension(numberStr);
        const normalizedOriginal = numberToValidate.replace(/\s/g, '');

        let normalizedParsed = '';

        if (phoneNumber) {
            // Use phoneNumber.number (E.164 format, guaranteed NO extension) 
            // and re-parse it to get the correctly spaced 'INTERNATIONAL' format.
            const coreNumberE164 = phoneNumber.number;

            // Re-parse the core number to get the spaced INTERNATIONAL format without the extension
            // Note: This is required because format('INTERNATIONAL') on the original number might include the extension.
            const coreFormatted = parsePhoneNumber(coreNumberE164).format('INTERNATIONAL');

            // Manually append the extension in the standard format (' x{ext}').
            const extension = phoneNumber.ext ? ` x${phoneNumber.ext}` : '';
            suggestedFix = coreFormatted + extension;
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
 * Validates a whole phone number tag using libphonenumber-js.
 * @param {string} tagValue - The phone number value string to validate (possibly containing multiple numbers).
 * @param {string} countryCode - The country code for validation.
 * @param {map} osmTags - All the OSM tags of the object, to check against exclusions
 * @returns {object} - The status and details of the processed item.
 * @property {boolean} isInvalid - Indicates whether the number is invalid.
 * @property {boolean} isAutoFixable - Indicates whether the number can be automatically corrected.
 * @property {Array<string>} suggestedNumbersList - A list of suggested corrections (as strings).
 * @property {number} numberOfValues - The number of phone values checked.
 */
function validateSingleTag(tagValue, countryCode, osmTags) {
    // Define the regex for separators that are definitively "bad" and should trigger a fix report.
    const BAD_SEPARATOR_REGEX = /(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

    // This regex is used for splitting. It catches ALL valid and invalid separators:
    // Raw semicolon (';'), semicolon with optional space ('; ?'), comma, slash, 'or' or 'and'.
    const UNIVERSAL_SPLIT_REGEX = /(?:; ?)|(?:\s*,\s*)|(?:\s*\/\s*)|(?:\s+or\s+)|(?:\s+and\s+)/gi;

    const originalTagValue = tagValue.trim();

    // Check if a bad separator was used
    const hasBadSeparator = originalTagValue.match(BAD_SEPARATOR_REGEX);

    // Single-step splitting: The regex finds all separators and removes them.
    const numbers = originalTagValue
        .split(UNIVERSAL_SPLIT_REGEX)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    let hasIndividualInvalidNumber = false;

    const tagValidationResult = {
        isInvalid: false,
        isAutoFixable: true,
        suggestedNumbersList: [],
        numberOfValues: 0
    };

    numbers.forEach(numberStr => {
        tagValidationResult.numberOfValues++;

        const validationResult = processSingleNumber(numberStr, countryCode, osmTags);
        const { isInvalid, suggestedFix, autoFixable } = validationResult;

        if (suggestedFix) {
            tagValidationResult.suggestedNumbersList.push(suggestedFix);
        }

        if (isInvalid) {
            hasIndividualInvalidNumber = true;
            tagValidationResult.isAutoFixable = tagValidationResult.isAutoFixable && autoFixable;
        }
    });

    // Final check for invalidity due to bad separators
    if (hasIndividualInvalidNumber || hasBadSeparator) {
        tagValidationResult.isInvalid = true;
        if (hasBadSeparator) {
            tagValidationResult.isAutoFixable = tagValidationResult.isAutoFixable && true;
        }
    }

    return tagValidationResult;
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

    elements.forEach(element => {
        if (element.tags) {
            const tags = element.tags;

            let website = WEBSITE_TAGS.map(tag => tags[tag]).find(url => url);
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
                website: website,
                lat: lat,
                lon: lon,
                name: name,
                allTags: tags,
                invalidNumbers: new Map(),
                suggestedFixes: new Map(),
            };

            for (const tag of PHONE_TAGS) {
                if (!tags[tag]) {
                    continue
                }
                const phoneTagValue = tags[tag];

                const validationResult = validateSingleTag(phoneTagValue, countryCode, tags);
                
                const isInvalid = validationResult.isInvalid;
                const suggestedFix = validationResult.suggestedNumbersList.join('; ')
                const autoFixable = validationResult.autoFixable;
                totalNumbers += validationResult.numberOfValues;

                if (isInvalid) {        
                    if (!invalidItemsMap.has(key)) {
                        invalidItemsMap.set(key, { ...baseItem, autoFixable: autoFixable });
                    }
                    const item = invalidItemsMap.get(key);

                    item.invalidNumbers.set(tag, phoneTagValue);
                    item.suggestedFixes.set(tag, suggestedFix);

                    item.autoFixable = item.autoFixable && autoFixable;
                }
            }
        }
    });

    const invalidItemsArray = Array.from(invalidItemsMap.values()).map(item => ({
        ...item,
        invalidNumbers: Object.fromEntries(item.invalidNumbers),
        suggestedFixes: Object.fromEntries(item.suggestedFixes)
    }));

    return { invalidNumbers: invalidItemsArray, totalNumbers };
}

module.exports = {
    safeName,
    validateNumbers,
    isDisused,
    getFeatureTypeName,
    stripExtension,
    processSingleNumber,
    validateSingleTag,
    checkExclusions
};
