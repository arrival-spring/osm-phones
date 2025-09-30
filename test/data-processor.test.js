const {
    stripExtension,
    checkExclusions,
    processSingleNumber,
    validateNumbers,
    getFeatureTypeName,
    isDisused
} = require('../src/data-processor');

const SAMPLE_COUNTRY_CODE_GB = 'GB';
const SAMPLE_COUNTRY_CODE_US = 'US';
const SAMPLE_COUNTRY_CODE_ZA = 'ZA';

// =====================================================================
// isdisused Tests
// =====================================================================
describe("isDisused", () => {
    // Disused
    test('disused object is disused', () => {
        expect(isDisused({allTags: {'disused:amenity': 'cafe'}})).toBe(true)
    });

    test('historic object is disused', () => {
        expect(isDisused({allTags: {'historic:amenity': 'cafe'}})).toBe(true)
    });

    test('was object is disused', () => {
        expect(isDisused({allTags: {'was:amenity': 'cafe'}})).toBe(true)
    });

    test('abandoned object is disused', () => {
        expect(isDisused({allTags: {'abandoned:amenity': 'cafe'}})).toBe(true)
    });

    // Not disused
    test('regular object is not disused', () => {
        expect(isDisused({allTags: {'amenity': 'cafe'}})).toBe(false)
    });

    test('regular object with old disused tags is not disused', () => {
        expect(isDisused({allTags: {'amenity': 'cafe', 'was:amenity': 'place_of_worship'}})).toBe(false)
    });

    test('empty tags is not disused', () => {
        expect(isDisused({allTags: {}})).toBe(false)
    });
});

// =====================================================================
// stripExtension Tests
// =====================================================================
describe('stripExtension', () => {
    test('should strip an extension prefixed by "x"', () => {
        expect(stripExtension('020 7946 0000 x123')).toBe('020 7946 0000');
    });

    test('should strip an extension prefixed by "ext"', () => {
        expect(stripExtension('+44 20 7946 0000 ext. 456')).toBe('+44 20 7946 0000');
    });

    test('should return the original string if no extension is present', () => {
        expect(stripExtension('0800 123 4567')).toBe('0800 123 4567');
    });
});

// =====================================================================
// checkExclusions Tests
// =====================================================================
/**
 * A mock function to simulate the output of a successful phone number parse 
 * (from libphonenumber-js), primarily exposing the nationalNumber.
 * * @param {string} nationalNumber - The core national number of the phone number.
 * @param {string} countryCode - The country code (e.g., 'FR').
 * @returns {Object} A mock phone number object.
 */
const mockPhoneNumber = (nationalNumber, countryCode) => ({
    nationalNumber: nationalNumber, 
    country: countryCode,
});

describe('checkExclusions', () => {
    
    const FR = 'FR';
    const DE = 'DE'; // Non-excluded country
    const excludedNumber = '3631';
    const otherNumber = '1234'; // Non-excluded number
    const requiredTags = { amenity: 'post_office' };
    const irrelevantTags = { shop: 'bank', operator: 'La Banque Postale' };
    const emptyTags = {};

    // --- SUCCESS CASES: Should return the exclusion object ---

    test('should return exclusion result when country, number, and tags match', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber
        };
        expect(checkExclusions(phoneNumber, FR, requiredTags)).toEqual(expected);
    });

    test('should return exclusion result when number and tags match, even with extra irrelevant tags', () => {
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        const combinedTags = { ...requiredTags, ...irrelevantTags };
        const expected = {
            isInvalid: false,
            autoFixable: true,
            suggestedFix: excludedNumber
        };
        expect(checkExclusions(phoneNumber, FR, combinedTags)).toEqual(expected);
    });

    // --- FAILURE CASES: Should return null ---

    test('should return null when the country code does not match', () => {
        // 3631 is only excluded for FR, not DE
        const phoneNumber = mockPhoneNumber(excludedNumber, DE);
        expect(checkExclusions(phoneNumber, DE, requiredTags)).toBeNull();
    });

    test('should return null when the phone number is not excluded, even if tags and country match', () => {
        // FR is excluded, amenity=post_office is the required tag, but the number is wrong
        const phoneNumber = mockPhoneNumber(otherNumber, FR);
        expect(checkExclusions(phoneNumber, FR, requiredTags)).toBeNull();
    });

    test('should return null when the required OSM tag value is incorrect', () => {
        // Correct country and number, but the amenity tag is 'bank' instead of 'post_office'
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        expect(checkExclusions(phoneNumber, FR, irrelevantTags)).toBeNull();
    });

    test('should return null when the required OSM tag is missing (empty tags)', () => {
        // Correct country and number, but no tags are passed
        const phoneNumber = mockPhoneNumber(excludedNumber, FR);
        expect(checkExclusions(phoneNumber, FR, emptyTags)).toBeNull();
    });
    
    test('should return null when no phoneNumber object is provided', () => {
        // Should handle the case where parsePhoneNumber failed and returned null
        expect(checkExclusions(null, FR, requiredTags)).toBeNull();
    });
});

// =====================================================================
// processSingleNumber Tests
// =====================================================================
describe('processSingleNumber', () => {
    // --- GB Tests (London number: 020 7946 0000) ---

    test('GB: consider no spacing to be valid', () => {
        const result = processSingleNumber('+442079460000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
    });

    test('GB: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('02079460000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
        expect(result.autoFixable).toBe(true);
    });

    test('GB: correctly validate and format an international valid number', () => {
        const result = processSingleNumber('+44 20 7946 0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: flag a valid number with bad internal spacing as invalid but autoFixable', () => {
        const result = processSingleNumber('020 7946  0000', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000');
    });

    test('GB: flag a valid number with extension as valid', () => {
        const result = processSingleNumber('+44 20 7946 0000 x123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(false);
    });

    test('GB: flag a valid number with non-standard extension as invalid but autoFixable', () => {
        const result = processSingleNumber('+44 20 7946 0000 ext.123', SAMPLE_COUNTRY_CODE_GB);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(true);
        expect(result.suggestedFix).toBe('+44 20 7946 0000 x123');
    });

    // --- ZA Tests (Johannesburg number: 011 555 1234) ---

    test('ZA: correctly validate and format a simple valid local number', () => {
        // Local ZA format including trunk prefix '0'
        const result = processSingleNumber('011 555 1234', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+27 11 555 1234');
        expect(result.autoFixable).toBe(true);
    });

    test('ZA: correctly validate and format an international valid number', () => {
        const result = processSingleNumber('+27 11 555 1234', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(false);
        expect(result.suggestedFix).toBe('+27 11 555 1234');
    });

    test('ZA: flag a clearly invalid (too short) number as invalid and unfixable', () => {
        const result = processSingleNumber('011 555', SAMPLE_COUNTRY_CODE_ZA);
        expect(result.isInvalid).toBe(true);
        expect(result.autoFixable).toBe(false);
    });

    // --- USA Tests (+1 213 373 4253) ---

    test('US: correctly validate and format a simple valid local number', () => {
        const result = processSingleNumber('213 373 4253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(true);
        expect(result.suggestedFix).toBe('+1 213-373-4253');
        expect(result.autoFixable).toBe(true);
    });

    test('US: bad spacing is not invalid', () => {
        const result = processSingleNumber('+121 337 34253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(false);
    });

    test('US: dashes is not invalid', () => {
        const result = processSingleNumber('+1-213-373=4253', SAMPLE_COUNTRY_CODE_US);
        expect(result.isInvalid).toBe(false);
    });
});

// =====================================================================
// validateNumbers Tests
// =====================================================================
describe('validateNumbers', () => {
    const mockElements = [{
        type: 'node',
        id: 101,
        tags: {
            name: 'London Pub',
            phone: '020 7946 0000, +442079460001', // Bad separator (comma)
            amenity: 'pub'
        }
    }, {
        type: 'way',
        id: 202,
        tags: {
            name: 'London Hotel',
            // Missing a digit, and contains an extension
            'contact:phone': '020 1234 567 x10; +44 20 7946 0000',
            tourism: 'hotel',
        }
    }];

    test('should correctly find and count total numbers processed across all elements', () => {
        // London Pub: 2 numbers. London Hotel: 2 numbers = 4 total
        const result = validateNumbers(mockElements, SAMPLE_COUNTRY_CODE_GB);
        expect(result.totalNumbers).toBe(4);
    });

    test('should identify invalid items due to bad separators', () => {
        const result = validateNumbers(mockElements, SAMPLE_COUNTRY_CODE_GB);
        expect(result.invalidNumbers.length).toBe(2);

        // Check the 'London Pub' node
        const londonPub = result.invalidNumbers.find(item => item.id === 101);
        expect(londonPub).toBeDefined();
        // The original tag value is added because of the bad separator (comma)
        expect(londonPub.invalidNumbers).toContain('020 7946 0000, +442079460001');
        expect(londonPub.autoFixable).toBe(true); // Separator fix is auto-fixable

        // Suggested fix: correctly formatted numbers joined by semicolon
        expect(londonPub.suggestedFixes.join('; ')).toBe('+44 20 7946 0000; +44 20 7946 0001');
    });

    test('should identify invalid items due to invalid number', () => {
        const result = validateNumbers(mockElements, SAMPLE_COUNTRY_CODE_GB);

        // Check the 'London Hotel' way
        const londonHotel = result.invalidNumbers.find(item => item.id === 202);
        expect(londonHotel).toBeDefined();

        // One number is invalid (020 1234 567 x10), give the whole string (to be displayed on the webpage)
        expect(londonHotel.invalidNumbers).toEqual('020 1234 567 x10; +44 20 7946 0000');
        // Invalid number makes the whole item unfixable
        expect(londonHotel.autoFixable).toBe(false);
    });

    const singleNumberElements = [{
        type: 'node',
        id: 400,
        tags: {
            'phone': '01389 123456'
        }
    }, {
        type: 'node',
        id: 401,
        tags: {
            'phone': '+44 01389 123456'
        }
    }, {
        type: 'node',
        id: 402,
        tags: {
            'phone': '+44 (0) (1389) 123456'
        }
    }, {
        type: 'node',
        id: 403,
        tags: {
            'phone': '+44 1389 123456 x104'
        }
    }];

    test('autofix single invalid numbers', () => {
        const result = validateNumbers(singleNumberElements, SAMPLE_COUNTRY_CODE_GB);
        const node400 = result.invalidNumbers.find(item => item.id === 400);
        expect(node400).toBeDefined();
        expect(node400.autoFixable).toBe(true);
        expect(node400.suggestedFixes.join('; ')).toBe('+44 1389 123456')

        const node401 = result.invalidNumbers.find(item => item.id === 401);
        expect(node401).toBeDefined();
        expect(node401.autoFixable).toBe(true);
        expect(node401.suggestedFixes.join('; ')).toBe('+44 1389 123456')

        const node402 = result.invalidNumbers.find(item => item.id === 402);
        expect(node402).toBeDefined();
        expect(node402.autoFixable).toBe(true);
        expect(node402.suggestedFixes.join('; ')).toBe('+44 1389 123456')
    });

    const badSeparatorElements = [{
        type: 'node',
        id: 200,
        tags: {
            'phone': '+44 1389 123456 or +44 1389 123457'
        }
    }, {
        type: 'node',
        id: 201,
        tags: {
            'phone': '+44 1389 123456 and +44 1389 123457'
        }
    }, {
        type: 'node',
        id: 202,
        tags: {
            'phone': '+44 1389 123456, +44 1389 123457'
        }
    }, {
        type: 'node',
        id: 203,
        tags: {
            'phone': '+44 1389 123456/+44 1389 123457'
        }
    }];

    test('autofix incorrect separators', () => {
        const result = validateNumbers(badSeparatorElements, SAMPLE_COUNTRY_CODE_GB);
        const node200 = result.invalidNumbers.find(item => item.id === 200);
        expect(node200).toBeDefined();
        expect(node200.autoFixable).toBe(true);
        expect(node200.suggestedFixes.join('; ')).toBe('+44 1389 123456; +44 1389 123457')

        const node201 = result.invalidNumbers.find(item => item.id === 201);
        expect(node201).toBeDefined();
        expect(node201.autoFixable).toBe(true);
        expect(node201.suggestedFixes.join('; ')).toBe('+44 1389 123456; +44 1389 123457')

        const node202 = result.invalidNumbers.find(item => item.id === 202);
        expect(node202).toBeDefined();
        expect(node202.autoFixable).toBe(true);
        expect(node202.suggestedFixes.join('; ')).toBe('+44 1389 123456; +44 1389 123457')

        const node203 = result.invalidNumbers.find(item => item.id === 203);
        expect(node203).toBeDefined();
        expect(node203.autoFixable).toBe(true);
        expect(node203.suggestedFixes.join('; ')).toBe('+44 1389 123456; +44 1389 123457')
    });

    const mixedInvalidElements = [{
        type: 'node',
        id: 300,
        tags: {
            'phone': '+44 1389 123456; 01389 123457'
        }
    }, {
        type: 'node',
        id: 301,
        tags: {
            'phone': '+44 1389 123456; +44 1389'
        }
    }];

    test('fix one fixable number and keep existing valid number', () => {
        const result = validateNumbers(mixedInvalidElements, SAMPLE_COUNTRY_CODE_GB);
        const node300 = result.invalidNumbers.find(item => item.id === 300);
        expect(node300).toBeDefined();
        expect(node300.autoFixable).toBe(true);
        expect(node300.suggestedFixes.join('; ')).toBe('+44 1389 123456; +44 1389 123457')
    });

    test('one valid and one invalid makes the whole thing invalid', () => {
        const result = validateNumbers(mixedInvalidElements, SAMPLE_COUNTRY_CODE_GB);
        const node301 = result.invalidNumbers.find(item => item.id === 301);
        expect(node301).toBeDefined();
        expect(node301.autoFixable).toBe(false);
    });

    const websiteElements = [{
        type: 'node',
        id: 102,
        tags: {
            'phone': '1234', // needs invalid phone to be included in results
            'website': 'www.pub.com'
        }
    }, {
        type: 'node',
        id: 103,
        tags: {
            'phone': '1234',
            'contact:website': 'https://bar.com'
        }
    }, {
        type: 'node',
        id: 104,
        tags: {
            'phone': '1234',
            'contact:website': 'https://bar.com',
            'website': 'https://pub.com'
        }
    }];

    test('add scheme to website if it has none', () => {
        const result = validateNumbers(websiteElements, SAMPLE_COUNTRY_CODE_GB);

        const pub = result.invalidNumbers.find(item => item.id === 102);
        expect(pub).toBeDefined();
        expect(pub.website).toBe('http://www.pub.com');
    });
    test('contact:website is also detected', () => {
        const result = validateNumbers(websiteElements, SAMPLE_COUNTRY_CODE_GB);

        const bar = result.invalidNumbers.find(item => item.id === 103);
        expect(bar).toBeDefined();
        expect(bar.website).toBe('https://bar.com');
    });
    test('website taken first over contact:website', () => {
        const result = validateNumbers(websiteElements, SAMPLE_COUNTRY_CODE_GB);

        const doubleWebsite = result.invalidNumbers.find(item => item.id === 104);
        expect(doubleWebsite).toBeDefined();
        expect(doubleWebsite.website).toBe('https://pub.com');
    });
});