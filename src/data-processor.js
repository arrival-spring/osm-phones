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
 * Validates phone numbers using libphonenumber-js.
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
            const phoneTags = ['phone', 'contact:phone'];
            const websiteTags = ['website', 'contact:website'];

            let website = websiteTags.map(tag => tags[tag]).find(url => url);
            if (website && !website.startsWith('http://') && !website.startsWith('https://')) {
                website = `http://${website}`;
            }

            const lat = element.lat || (element.center && element.center.lat);
            const lon = element.lon || (element.center && element.center.lon);
            const name = tags.name;
            const key = `${element.type}-${element.id}`;

            let foundInvalidNumber = false;

            for (const tag of phoneTags) {
                if (tags[tag]) {
                    const numbers = tags[tag].split(';').map(s => s.trim());
                    numbers.forEach(numberStr => {
                        totalNumbers++;
                        try {
                            const phoneNumber = parsePhoneNumber(numberStr, countryCode);

                            const normalizedOriginal = numberStr.replace(/\s/g, '');
                            let normalizedParsed = '';
                            if (phoneNumber && phoneNumber.isValid()) {
                                normalizedParsed = phoneNumber.number.replace(/\s/g, '');
                            }

                            const isInvalid = normalizedOriginal !== normalizedParsed;

                            if (isInvalid) {
                                foundInvalidNumber = true;
                                if (!invalidItemsMap.has(key)) {
                                    invalidItemsMap.set(key, {
                                        type: element.type,
                                        id: element.id,
                                        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
                                        tag: tag,
                                        website: website,
                                        lat: lat,
                                        lon: lon,
                                        name: name,
                                        allTags: tags,
                                        invalidNumbers: [],
                                        suggestedFixes: [],
                                        autoFixable: true
                                    });
                                }
                                const item = invalidItemsMap.get(key);
                                item.invalidNumbers.push(numberStr);
                                item.suggestedFixes.push(phoneNumber ? phoneNumber.format('INTERNATIONAL') : 'No fix available');
                                if (!phoneNumber || !phoneNumber.isValid()) {
                                    item.autoFixable = false;
                                }
                            }
                        } catch (e) {
                            foundInvalidNumber = true;
                            if (!invalidItemsMap.has(key)) {
                                invalidItemsMap.set(key, {
                                    type: element.type,
                                    id: element.id,
                                    osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
                                    tag: tag,
                                    website: website,
                                    lat: lat,
                                    lon: lon,
                                    name: name,
                                    allTags: tags,
                                    invalidNumbers: [],
                                    suggestedFixes: [],
                                    autoFixable: false,
                                    error: e.message
                                });
                            }
                            const item = invalidItemsMap.get(key);
                            item.invalidNumbers.push(numberStr);
                            item.suggestedFixes.push('No fix available');
                            item.autoFixable = false;
                        }
                    });
                }
            }
        }
    });

    return { invalidNumbers: Array.from(invalidItemsMap.values()), totalNumbers };
}

module.exports = {
    safeName,
    validateNumbers,
    getFeatureTypeName
};
