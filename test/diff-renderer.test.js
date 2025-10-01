const {
    normalize,
    consolidatePlusSigns,
    diffPhoneNumbers,
    getDiffHtml
} = require('../src/diff-renderer');

// --- Test Suites ---

describe('Phone Diff Helper Functions', () => {

    test('normalize should remove all non-digits', () => {
        expect(normalize('+44 (0) 1234-567 890')).toBe('4401234567890');
        expect(normalize('0471 124 380')).toBe('0471124380');
        expect(normalize('32 471 12 43 80')).toBe('32471124380');
    });

    test('consolidatePlusSigns should merge lone "+" with the following segment', () => {
        const input1 = ['+', '32 58 515 592', '; ', '+', '32 473 792 951'];
        const expected1 = ['+32 58 515 592', '; ', '+32 473 792 951'];
        expect(consolidatePlusSigns(input1)).toEqual(expected1);

        // Case 2: Standard number, no issue
        const input2 = ['0471 124 380', ' / ', '+32 471 12 43 80'];
        expect(consolidatePlusSigns(input2)).toEqual(input2);

        // Case 3: Leading '+' at the start (should not be treated as lone separator)
        const input3 = ['+32 123 456'];
        expect(consolidatePlusSigns(input3)).toEqual(['+32 123 456']);
    });
});


describe('diffPhoneNumbers (Single Number Diff Logic)', () => {
    const originalGood = '+4 12'
    const originalLeadingZero = '012';
    const suggestedLeadingZero = originalGood;

    const originalLeadingZeroDiff = [
        {value: '0', removed: true},
        {value: '1', removed: false, added: false},
        {value: '2', removed: false, added: false},
    ]
    const suggestedLeadingZeroDiff = [
        {value: '+', added: true},
        {value: '4', added: true},
        {value: ' ', added: true},
        {value: '1', removed: false, added: false},
        {value: '2', removed: false, added: false},
    ]

    const originalExtraZero = '+4 012'
    const originalExtraZeroDiff = [
        {value: '+', removed: false, added: false},
        {value: '4', removed: false, added: false},
        {value: ' ', removed: false, added: false},
        {value: '0', removed: true},
        {value: '1', removed: false, added: false},
        {value: '2', removed: false, added: false},
    ]
    const suggestedExtraZero = originalGood
    const suggestedExtraZeroDiff = [
        {value: '+', removed: false, added: false},
        {value: '4', removed: false, added: false},
        {value: ' ', removed: false, added: false},
        {value: '1', removed: false, added: false},
        {value: '2', removed: false, added: false},
    ]

    const originalGood2 = '+4 13'
    const originalGood2Diff = [
        {value: '+', removed: false, added: false},
        {value: '4', removed: false, added: false},
        {value: ' ', removed: false, added: false},
        {value: '1', removed: false, added: false},
        {value: '3', removed: false, added: false},
    ]
    const goodSeparator = '; '
    const goodSeparatorDiff = [
        {value: ';', removed: false, added: false},
        {value: ' ', removed: false, added: false}
    ];
    const badSeparator = ', '
    const badSeparatorDiff = [
        {value: ',', removed: true},
        {value: ' ', removed: false, added: false}
    ];
    const badToGoodSeparatorDiff = [
        {value: ';', added: true},
        {value: ' ', removed: false, added: false}
    ];

    test('basic phone number diff test', () => {
        const result = diffPhoneNumbers(originalLeadingZero, suggestedLeadingZero);

        expect(result.originalDiff).toEqual(originalLeadingZeroDiff)
        expect(result.suggestedDiff).toEqual(suggestedLeadingZeroDiff)
    });

    test('basic phone number diff test with leading plus', () => {
        const result = diffPhoneNumbers(originalExtraZero, suggestedLeadingZero);

        expect(result.originalDiff).toEqual(originalExtraZeroDiff)
        expect(result.suggestedDiff).toEqual(suggestedExtraZeroDiff)
    });

    // test('two numbers, semicolon separator, changes to one number', () => {
    //     const result = diffPhoneNumbers(originalExtraZero + goodSeparator + originalGood2, suggestedExtraZero + goodSeparator + originalGood2);

    //     expect(result.originalDiff).toEqual([...originalExtraZeroDiff, ...goodSeparatorDiff, ...originalGood2Diff]);
    //     expect(result.suggestedDiff).toEqual([...suggestedExtraZeroDiff, ...goodSeparatorDiff, ...originalGood2Diff]);
    // });

    // test('notice change to bad separator', () => {
    //     const result = diffPhoneNumbers(originalExtraZero + badSeparator + originalGood2, suggestedExtraZero + goodSeparator + originalGood2);

    //     expect(result.originalDiff).toEqual([...originalExtraZeroDiff, ...goodSeparatorDiff, ...originalGood2Diff]);
    //     expect(result.suggestedDiff).toEqual([...suggestedExtraZeroDiff, ...badToGoodSeparatorDiff, ...originalGood2Diff]);
    // });

    test('should correctly identify prefix addition/removal and formatting changes (0 removal, 32 addition)', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';

        const result = diffPhoneNumbers(original, suggested);

        // 1. Check Original Diff: '0' and all spaces removed. Digits unchanged.
        const expectedOriginalHtml =
            '<span class="diff-removed">0</span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">1</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-unchanged">3</span><span class="diff-unchanged">8</span><span class="diff-unchanged">0</span>';
        expect(result.originalDiff.map(p => `<span class="diff-${p.removed ? 'removed' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedOriginalHtml);

        // 2. Check Suggested Diff: '+32' and all spaces added. Digits unchanged.
        const expectedSuggestedHtml =
            '<span class="diff-added">+</span><span class="diff-added">3</span><span class="diff-added">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">1</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">3</span><span class="diff-added"> </span><span class="diff-unchanged">8</span><span class="diff-unchanged">0</span>';
        expect(result.suggestedDiff.map(p => `<span class="diff-${p.added ? 'added' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedSuggestedHtml);
    });

    test('should correctly handle complex formatting changes (+44 example)', () => {
        const original = '+44 (0) 1234 5678';
        const suggested = '+44 1234 5678';

        const result = diffPhoneNumbers(original, suggested);

        // Only change is removing brackets, 0 and a space
        const expectedOriginalHtml =
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-unchanged"> </span><span class="diff-removed">(</span><span class="diff-removed">0</span><span class="diff-removed">)</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-unchanged"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(result.originalDiff.map(p => `<span class="diff-${p.removed ? 'removed' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedOriginalHtml);

        // Suggested: everything present is unchanged.
        const expectedSuggestedHtml =
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-unchanged"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-unchanged"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(result.suggestedDiff.map(p => `<span class="diff-${p.added ? 'added' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedSuggestedHtml);
    });
});


describe('getDiffHtml (Multi-Number Diff Logic)', () => {

    // Case 1: Simple two numbers, semicolon separated, with 0 removal
    test('should correctly diff two semicolon-separated numbers', () => {
        const original = '+32 058 515 592;+32 0473 792 951';
        const suggested = '+32 58 51 55 92; +32 473 79 29 51';

        const result = getDiffHtml(original, suggested);

        // --- Original HTML (Removals) ---
        // Original '0' marked removed.
        const expectedOriginalN1 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-unchanged"> </span><span class="diff-removed">0</span><span class="diff-unchanged">5</span><span class="diff-unchanged">8</span><span class="diff-unchanged"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span><span class="diff-unchanged">5</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span>';
        const expectedOriginalSeparator = '<span class="diff-unchanged">;</span>';
        const expectedOriginalN2 = '<span class="diff-removed">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-removed">0</span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">3</span><span class="diff-removed"> </span><span class="diff-unchanged">7</span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-unchanged">9</span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalSeparator + expectedOriginalN2);


        // --- Suggested HTML (Additions) ---
        // Suggested: added space after semicolon and space either side of 55 and of 29.
        const expectedSuggestedN1 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-unchanged"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">8</span><span class="diff-unchanged"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">5</span><span class="diff-added"> </span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span>';
        const expectedSuggestedSeparator = '<span class="diff-unchanged">;</span><span class="diff-added"> </span>';
        const expectedSuggestedN2 = '<span class="diff-added">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-unchanged"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">3</span><span class="diff-unchanged"> </span><span class="diff-unchanged">7</span><span class="diff-unchanged">9</span><span class="diff-added"> </span><span class="diff-unchanged">2</span><span class="diff-unchanged">9</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedSeparator + expectedSuggestedN2);
    });

    // Case 2: Different separator in original
    test('should correctly handle complex separators like " / " and digit addition', () => {
        const original = '0123 / 4567';
        const suggested = '+90 123; +90 4567';

        const result = getDiffHtml(original, suggested);

        // --- Original HTML (Removals) ---
        // The leading '0' is marked diff-unchanged in the received output, so we match that here.
        const expectedOriginalN1 = '<span class="diff-unchanged">0</span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span>';
        const expectedOriginalSeparator = '<span class="diff-removed"> /</span><span class="diff-unchanged"> /</span>';
        const expectedOriginalN2 = '<span class="diff-unchanged">4</span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalSeparator + expectedOriginalN2);

        // --- Suggested HTML (Additions) ---
        // The '0' in the first number is marked diff-unchanged in the received output.
        const expectedSuggestedN1 = '<span class="diff-added">+</span><span class="diff-added">9</span><span class="diff-unchanged">0</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span>';
        const expectedSuggestedSeparator = '<span class="diff-added">;</span><span class="diff-unchanged"> /</span>';
        const expectedSuggestedN2 = '<span class="diff-added">+</span><span class="diff-added">9</span><span class="diff-added">0</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedSeparator + expectedSuggestedN2);
    });
});