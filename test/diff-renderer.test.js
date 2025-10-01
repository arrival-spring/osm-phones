const { 
    normalize, 
    consolidatePlusSigns, 
    diffPhoneNumbers, 
    getDiffHtml 
} = require('../src/diff-renderer');

// --- Mocking the external 'diffChars' library ---
// Since the real jsdiff is complex, we mock it for the critical test cases
// based on what we *expect* it to return after normalization.
const mockDiffChars = (a, b) => {
    // This simple mock handles the core prefix/digit change scenario
    
    // Case: Prefix addition (e.g., '0123' -> '32123')
    if (a.length < b.length && b.endsWith(a)) {
        const addedValue = b.substring(0, b.length - a.length);
        return [
            { added: true, value: addedValue },
            { value: a }
        ];
    }
    
    // Case: Prefix removal (e.g., '0123' -> '123')
    if (a.length > b.length && a.endsWith(b)) {
        const removedValue = a.substring(0, a.length - b.length);
        return [
            { removed: true, value: removedValue },
            { value: b }
        ];
    }
    
    // Case: Complex change (e.g., '0471124380' -> '32471124380')
    // This is the specific case from the user's issue: '0' removed, '32' added.
    if (a === '0471124380' && b === '32471124380') {
        return [
            { removed: true, value: '0' },
            { added: true, value: '32' },
            { value: '471124380' }
        ];
    }
    
    // Default: Assume diffChars finds the common part correctly (e.g., if strings are equal)
    if (a === b) {
        return [{ value: a }];
    }
    
    // Fallback: Use a real-world simple library if available, or just fail cleanly
    // For this environment, we rely on the specific mock cases above.
    
    throw new Error(`MockDiffChars not implemented for A: ${a} and B: ${b}`);
};


// --- Test Suites ---

describe('Phone Diff Helper Functions', () => {
    
    test('normalize should remove all non-digits', () => {
        expect(normalize('+44 (0) 1234-567 890')).toBe('4401234567890');
        expect(normalize('0471 124 380')).toBe('0471124380');
        expect(normalize('32 471 12 43 80')).toBe('32471124380');
    });

    test('consolidatePlusSigns should merge lone "+" with the following segment', () => {
        // Case 1: Multiple numbers, split leaves lone '+'
        const input1 = ['+','32 58 515 592', '; ', '+', '32 473 792 951'];
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
    
    test('should correctly identify prefix addition/removal and formatting changes (0 removal, 32 addition)', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';
        
        // normalizedOriginal: '0471124380'
        // normalizedSuggested: '32471124380'
        // Mock diff: [ {removed: '0'}, {added: '32'}, {value: '471124380'} ]

        const result = diffPhoneNumbers(original, suggested, mockDiffChars);

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
        
        // normalizedOriginal: '44012345678'
        // normalizedSuggested: '4412345678'
        // Mock diff: [ {value: '44'}, {removed: '0'}, {value: '12345678'} ]
        
        // NOTE: The mockDiffChars must be updated to handle this specific case for true isolation
        const mockComplexDiff = (a, b) => {
            if (a === '44012345678' && b === '4412345678') {
                return [
                    { value: '44' }, 
                    { removed: '0' }, 
                    { value: '12345678' }
                ];
            }
            return mockDiffChars(a, b);
        };
        
        const result = diffPhoneNumbers(original, suggested, mockComplexDiff);

        // Original: '+44 (0) 1234 5678' -> '(0)' and spaces removed
        const expectedOriginalHtml = 
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-removed">(</span><span class="diff-removed">0</span><span class="diff-removed">)</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(result.originalDiff.map(p => `<span class="diff-${p.removed ? 'removed' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedOriginalHtml);

        // Suggested: '+44 1234 5678' -> new spaces added.
        const expectedSuggestedHtml = 
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(result.suggestedDiff.map(p => `<span class="diff-${p.added ? 'added' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedSuggestedHtml);
    });
});


describe('getDiffHtml (Multi-Number Diff Logic)', () => {
    
    // Case 1: Simple two numbers, semicolon separated, with 0 removal
    test('should correctly diff two semicolon-separated numbers', () => {
        const original = '+32 058 515 592;+32 0473 792 951';
        const suggested = '+32 58 51 55 92; +32 473 79 29 51';
        
        const result = getDiffHtml(original, suggested, mockDiffChars);
        
        // Expected changes for N1: '0' removed, spaces removed/added
        // Expected changes for N2: '0' removed, spaces removed/added
        // Separator: ';' removed, '; ' added
        
        // --- Original HTML (Removals) ---
        const expectedOriginalN1 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-removed">0</span><span class="diff-unchanged">5</span><span class="diff-unchanged">8</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span><span class="diff-unchanged">5</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span>';
        const expectedOriginalSeparator = '<span class="diff-removed">;</span>';
        const expectedOriginalN2 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-removed">0</span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">3</span><span class="diff-removed"> </span><span class="diff-unchanged">7</span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-unchanged">9</span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalSeparator + expectedOriginalN2);


        // --- Suggested HTML (Additions) ---
        const expectedSuggestedN1 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">8</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">5</span><span class="diff-added"> </span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span>';
        const expectedSuggestedSeparator = '<span class="diff-added">; </span>';
        const expectedSuggestedN2 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">3</span><span class="diff-added"> </span><span class="diff-unchanged">7</span><span class="diff-unchanged">9</span><span class="diff-added"> </span><span class="diff-unchanged">2</span><span class="diff-unchanged">9</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedSeparator + expectedSuggestedN2);
    });
    
    // Case 2: Different separator in original
    test('should correctly handle complex separators like " / " and digit addition', () => {
        const original = '0123 / 4567';
        const suggested = '+90 123; +90 4567';
        
        const result = getDiffHtml(original, suggested, mockDiffChars);
        
        // --- Original HTML (Removals) ---
        // N1: '0' removed. Separator: ' / ' removed. N2: Digits unchanged.
        const expectedOriginalN1 = '<span class="diff-removed">0</span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span>';
        const expectedOriginalSeparator = '<span class="diff-removed"> / </span>';
        const expectedOriginalN2 = '<span class="diff-unchanged">4</span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalSeparator + expectedOriginalN2);

        // --- Suggested HTML (Additions) ---
        // N1: '+90' added. Separator: '; ' added. N2: '+90' added.
        const expectedSuggestedN1 = '<span class="diff-added">+</span><span class="diff-added">9</span><span class="diff-added">0</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span>';
        const expectedSuggestedSeparator = '<span class="diff-added">; </span>';
        const expectedSuggestedN2 = '<span class="diff-added">+</span><span class="diff-added">9</span><span class="diff-added">0</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedSeparator + expectedSuggestedN2);
    });
});
