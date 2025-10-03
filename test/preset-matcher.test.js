const { getBestPreset, getMatchScore } = require('../src/preset-matcher.js');

// 1. Mock the file system to prevent errors when requiring the main file
// This ensures that `fs.readFileSync` does not try to load real files during the test.
jest.mock('fs', () => ({
    readFileSync: jest.fn(() => JSON.stringify({})),
    existsSync: jest.fn(() => false)
}));

// 2. Define the specific tags for the test item
const cableTags = {
    communication: 'line',
    description: 'ZANDVOORT TO ZEEBRUGGE',
    name: 'Concerto 1E',
    operator: 'Interoute',
    'seamark:type': 'cable_submarine', // The important tag for the 'seamark' preset
    submarine: 'yes',
    wikidata: 'Q2490425',
};

// 3. Define the test item structure
const testItem = {
    type: 'way', // Should result in 'line' geometry
    allTags: cableTags
};

// 4. Define the mock presets used for matching
const mockPresets = {
    // Your 'seamark' preset definition
    'seamark': {
        id: 'seamark',
        icon: 'maki-harbor',
        geometry: ['point', 'vertex', 'line', 'area'],
        tags: {
            'seamark:type': '*'
        },
        matchScore: 0
    },
    // The generic line preset
    'line': {
        id: 'line',
        geometry: ['line'],
        tags: {}, // Matches everything with line geometry
        matchScore: 0.1
    },
    // A highly specific, better-scoring preset that might conflict
    'comm/cable': {
        id: 'comm/cable',
        icon: 'iD-icon-communication-cable',
        geometry: ['line'],
        tags: {
            'communication': 'line',
            'submarine': 'yes'
        },
        matchScore: 2 // High score to ensure it wins
    },
};

// 5. Global helper to inject mock presets into the logic during testing
global.getMockPresets = () => mockPresets;


describe('Preset Matching Logic', () => {

    // Test the specific match score function
    describe('getMatchScore', () => {
        const geometry = 'line'; // Calculated geometry for the testItem

        test('should correctly score the "line" preset', () => {
            const preset = mockPresets.line;
            // Expected score: 0.1 (matchScore) + 0 (specificMatches) + 0 (wildcardMatches) = 0.1
            expect(getMatchScore(preset, testItem.allTags, geometry)).toBe(0.1);
        });

        test('should correctly score the "seamark" preset (Wildcard Match)', () => {
            const preset = mockPresets.seamark;
            // Expected score: 0 (matchScore) + 0 (specificMatches) + 1 * 0.5 (wildcardMatches) = 0.5
            // This is greater than the 'line' preset's 0.1
            expect(getMatchScore(preset, testItem.allTags, geometry)).toBe(0.5);
        });

        test('should correctly score the "comm/cable" preset (Specific Match)', () => {
            const preset = mockPresets['comm/cable'];
            // Expected score: 2 (matchScore) + 2 (specificMatches for comm/line and submarine/yes) = 4
            expect(getMatchScore(preset, testItem.allTags, geometry)).toBe(4);
        });
    });

    // Test the main function
    describe('getBestPreset', () => {

        test('should choose the highest scoring specific preset ("comm/cable") over others', () => {
            const bestPreset = getBestPreset(testItem, 'en');
            // The 'comm/cable' preset (score 4) should beat 'seamark' (score 0.5) and 'line' (score 0.1)
            expect(bestPreset.id).toBe('comm/cable');
            expect(bestPreset.icon).toBe('iD-icon-communication-cable');
        });

        test('should select "seamark" if it is the highest scorer, beating the generic "line" preset', () => {
            // Remove the high-scoring 'comm/cable' to test the competition between seamark and line
            const competitionPresets = {
                'seamark': mockPresets.seamark,      // Score: 0.5
                'line': mockPresets.line             // Score: 0.1
            };
            global.getMockPresets = () => competitionPresets;

            const bestPreset = getBestPreset(testItem, 'en');

            // 'seamark' (0.5) should be selected and returned over 'line' (0.1)
            expect(bestPreset.id).toBe('seamark');
            expect(bestPreset.icon).toBe('maki-harbor');

            // Restore original mock
            global.getMockPresets = () => mockPresets;
        });

        test('should fall back to the generic line icon if the best matching preset has no icon', () => {
            // Force 'line' to win by giving it the highest score
            const noIconPresets = {
                'line': { ...mockPresets.line, matchScore: 10 }, // Force score 10
                'seamark': mockPresets.seamark
            };
            global.getMockPresets = () => noIconPresets;

            // Re-run the test logic using the local function (not the exported one)
            // Note: We need a helper function that uses getBestPreset and then applies the icon logic
            function getFeatureIconTest(item, locale) {
                const preset = getBestPreset(item, locale);
                if (preset && preset.icon) {
                    return preset.icon;
                }
                const geometry = getGeometry(item);
                return geometry === 'line' ? 'iD-icon-line' : 'iD-icon-relation'; // Simplified fallback
            }

            // The item is a 'line' geometry, and 'line' (no icon) is chosen
            const icon = getFeatureIconTest(testItem, 'en');
            expect(icon).toBe('iD-icon-line');

            // Restore original mock for subsequent tests
            global.getMockPresets = () => mockPresets;
        });
    });
});
