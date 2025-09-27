const {
    stripExtension,
    processSingleNumber,
    validateNumbers,
    getFeatureTypeName
} = require('../src/data-processor');

const SAMPLE_COUNTRY_CODE_GB = 'GB';
const SAMPLE_COUNTRY_CODE_ZA = 'ZA';

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
});

// =====================================================================
// validateNumbers Tests
// =====================================================================
describe('validateNumbers', () => {
    const mockElements = [{
        type: 'node',
        id: 101,
        lat: 51.5,
        lon: 0.1,
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

        // One number is invalid (020 1234 567 x10)
        expect(londonHotel.invalidNumbers).toEqual(['020 1234 567 x10']);
        // Invalid number makes the whole item unfixable
        expect(londonHotel.autoFixable).toBe(false);
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
        const node200 = result.invalidNumbers.find(item => item.id = 200);
        expect(node200).toBeDefined();
        expect(node200.autoFixable).toBe(true);
        expect(node200.suggestedFixes.join('; ')).tobe('+44 1389 123456; +44 1389 123457')

        const node201 = result.invalidNumbers.find(item => item.id = 201);
        expect(node201).toBeDefined();
        expect(node201.autoFixable).toBe(true);
        expect(node201.suggestedFixes.join('; ')).tobe('+44 1389 123456; +44 1389 123457')

        const node202 = result.invalidNumbers.find(item => item.id = 202);
        expect(node202).toBeDefined();
        expect(node202.autoFixable).toBe(true);
        expect(node202.suggestedFixes.join('; ')).tobe('+44 1389 123456; +44 1389 123457')

        const node203 = result.invalidNumbers.find(item => item.id = 203);
        expect(node203).toBeDefined();
        expect(node203.autoFixable).toBe(true);
        expect(node203.suggestedFixes.join('; ')).tobe('+44 1389 123456; +44 1389 123457')
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