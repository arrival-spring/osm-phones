const {
    normalize,
    consolidatePlusSigns,
    diffPhoneNumbers,
    mergeDiffs,
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
    const suggestedExtraZeroDiff = [
        {value: '+', removed: false, added: false},
        {value: '4', removed: false, added: false},
        {value: ' ', removed: false, added: false},
        {value: '1', removed: false, added: false},
        {value: '2', removed: false, added: false},
    ]

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

    test('should correctly identify prefix addition/removal and formatting changes (0 removal, 32 addition)', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';

        const result = diffPhoneNumbers(original, suggested);

        // Check Original Diff: '0' and space after 4 removed. Other digits and spaces unchanged.
        const expectedOriginal = [
            {value: '0', removed: true},
            {value: '4', removed: false, added: false},
            {value: '7', removed: false, added: false},
            {value: '1', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '1', removed: false, added: false},
            {value: '2', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: true},
            {value: '3', removed: false, added: false},
            {value: '8', removed: false, added: false},
            {value: '0', removed: false, added: false},
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)
        
        // Check Suggested Diff: '+32 ' and space after 3 added. Other digits and spaces unchanged.
        const expectedSuggested = [
            {value: '+', added: true},
            {value: '3', added: true},
            {value: '2', added: true},
            {value: ' ', added: true},
            {value: '4', removed: false, added: false},
            {value: '7', removed: false, added: false},
            {value: '1', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '1', removed: false, added: false},
            {value: '2', removed: false, added: false},
            {value: ' ', added: true},
            {value: '4', removed: false, added: false},
            {value: '3', removed: false, added: false},
            {value: ' ', added: true},
            {value: '8', removed: false, added: false},
            {value: '0', removed: false, added: false},
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });


    test('should correctly handle complex formatting changes (+44 example)', () => {
        const original = '+44 (0) 1234 5678';
        const suggested = '+44 1234 5678';

        const result = diffPhoneNumbers(original, suggested);

        // Only change is removing brackets, 0 and a space
        const expectedOriginal = [
            {value: '+', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '(', removed: true},
            {value: '0', removed: true},
            {value: ')', removed: true},
            {value: ' ', removed: true},
            {value: '1', removed: false, added: false},
            {value: '2', removed: false, added: false},
            {value: '3', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '5', removed: false, added: false},
            {value: '6', removed: false, added: false},
            {value: '7', removed: false, added: false},
            {value: '8', removed: false, added: false},
        ]
        expect(result.originalDiff).toEqual(expectedOriginal)
        
        // Suggested: everything present is unchanged.
        const expectedSuggested = [
            {value: '+', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '1', removed: false, added: false},
            {value: '2', removed: false, added: false},
            {value: '3', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '5', removed: false, added: false},
            {value: '6', removed: false, added: false},
            {value: '7', removed: false, added: false},
            {value: '8', removed: false, added: false},
        ]
        expect(result.suggestedDiff).toEqual(expectedSuggested)
    });
});


describe('mergeDiffs', () => {
    test('merge simple diff', () => {
        const original = [
            {value: '0', removed: true},
            {value: '1', removed: false, added: false},
            {value: '2', removed: false, added: false},
        ]
        const expectedMerged = [
            {value: '0', removed: true},
            {value: '12', removed: false, added: false},
        ]
        expect(mergeDiffs(original)).toEqual(expectedMerged)
    });

    test('merge multiple unchanged and removals diff', () => {
        const original = [
            {value: '+', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '(', removed: true},
            {value: '0', removed: true},
            {value: ')', removed: true},
            {value: ' ', removed: true},
            {value: '1', removed: false, added: false},
            {value: '2', removed: false, added: false},
            {value: '3', removed: false, added: false},
            {value: '4', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '5', removed: false, added: false},
            {value: '6', removed: false, added: false},
            {value: '7', removed: false, added: false},
            {value: '8', removed: false, added: false},
        ]
        const expectedMerged = [
            {value: '+44 ', removed: false, added: false},
            {value: '(0) ', removed: true},
            {value: '1234 5678', removed: false, added: false},
        ]
        expect(mergeDiffs(original)).toEqual(expectedMerged)
    });

    test('merge various multiple additions and unchanged', () => {
        const original = [
            {value: '+', added: true},
            {value: '3', added: true},
            {value: '2', added: true},
            {value: ' ', added: true},
            {value: '5', removed: false, added: false},
            {value: '8', removed: false, added: false},
            {value: ' ', removed: false, added: false},
            {value: '5', removed: false, added: false},
            {value: '1', removed: false, added: false},
            {value: ' ', added: true},
            {value: '5', removed: false, added: false},
            {value: '5', removed: false, added: false},
            {value: ' ', added: true},
            {value: '9', removed: false, added: false},
            {value: '2', removed: false, added: false},
        ]
        const expectedMerged = [
            {value: '+32 ', added: true},
            {value: '58 51', removed: false, added: false},
            {value: ' ', added: true},
            {value: '55', removed: false, added: false},
            {value: ' ', added: true},
            {value: '92', removed: false, added: false},
        ]
        expect(mergeDiffs(original)).toEqual(expectedMerged)
    });
});


describe('getDiffHtml', () => {

    // Single number, adding country code
    test('should correctly diff two semicolon-separated numbers', () => {
        const original = '023 456 7890';
        const suggested = '+37 23 456 7890';

        const result = getDiffHtml(original, suggested);

        // --- Original HTML (Removals) ---
        const expectedOriginal = '<span class="diff-removed">0</span><span class="diff-unchanged">23 456 7890</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        // --- Suggested HTML (Additions) ---
        const expectedSuggested = '<span class="diff-added">+37 </span><span class="diff-unchanged">23 456 7890</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    // Number with dashes in original and suggested
    test('should correctly diff two numbers with dashes and format change', () => {
        const original = '(347) 456-7890';
        const suggested = '+1 347-456-7890';

        const result = getDiffHtml(original, suggested);

        // --- Original HTML (Removals) ---
        const expectedOriginal = '<span class="diff-removed">(</span><span class="diff-unchanged">347</span><span class="diff-removed">) </span><span class="diff-unchanged">456-7890</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        // --- Suggested HTML (Additions) ---
        const expectedSuggested = '<span class="diff-added">+1 </span><span class="diff-unchanged">347</span><span class="diff-added">-</span><span class="diff-unchanged">456-7890</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });

    // Simple two numbers, semicolon separated, with 0 removal
    test('should correctly diff two semicolon-separated numbers', () => {
        const original = '+32 058 515 592;+32 0473 792 951';
        const suggested = '+32 58 51 55 92; +32 473 79 29 51';

        const result = getDiffHtml(original, suggested);

        // --- Original HTML (Removals) ---
        // Original '0' marked removed.
        const expectedOriginalN1 = '<span class="diff-unchanged">+32 </span><span class="diff-removed">0</span><span class="diff-unchanged">58 515</span><span class="diff-removed"> </span><span class="diff-unchanged">592;';
        const expectedOriginalN2 = '+32 </span><span class="diff-removed">0</span><span class="diff-unchanged">473 792</span><span class="diff-removed"> </span><span class="diff-unchanged">951</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalN2);

        // --- Suggested HTML (Additions) ---
        // Suggested: added space after semicolon and space either side of 55 and of 29.
        const expectedSuggestedN1 = '<span class="diff-unchanged">+32 58 51</span><span class="diff-added"> </span><span class="diff-unchanged">55</span><span class="diff-added"> </span><span class="diff-unchanged">92;';
        const expectedSuggestedN2 = '</span><span class="diff-added"> </span><span class="diff-unchanged">+32 473 79</span><span class="diff-added"> </span><span class="diff-unchanged">29</span><span class="diff-added"> </span><span class="diff-unchanged">51</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedN2);
    });

    // Different separator in original
    test('should correctly handle complex separators like " / " and digit addition', () => {
        const original = '0123 / 4567';
        const suggested = '+90 123; +90 4567';

        const result = getDiffHtml(original, suggested);

        // --- Original HTML (Removals) ---
        const expectedOriginal = '<span class="diff-unchanged">0123 </span><span class="diff-removed">/ </span><span class="diff-unchanged">4567</span>';
        expect(result.oldDiff).toBe(expectedOriginal);

        // --- Suggested HTML (Additions) ---
        const expectedSuggested = '<span class="diff-added">+9</span><span class="diff-unchanged">0</span><span class="diff-added"> </span><span class="diff-unchanged">123</span><span class="diff-added">;</span><span class="diff-unchanged"> </span><span class="diff-added">+90 </span><span class="diff-unchanged">4567</span>';
        expect(result.newDiff).toBe(expectedSuggested);
    });
});