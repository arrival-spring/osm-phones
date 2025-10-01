const { 
    normalize, 
    consolidatePlusSigns, 
    diffPhoneNumbers, 
    getDiffHtml
} = require('../src/diff-renderer'); 

// --- Mocking the external 'diffChars' library for semantic (digit) and visual diffs ---

// Get the original implementation to use as a fallback for non-mocked cases (like separators)
const originalDiffChars = require('diff').diffChars;

const semanticMock = (a, b) => {
    // Case 1 N1: '0471124380' -> '32471124380' (0 removed, 32 added)
    if (a === '0471124380' && b === '32471124380') {
        return [
            { removed: true, value: '0' },
            { added: true, value: '32' },
            { value: '471124380' }
        ];
    }
    // Case 2 N2: '44012345678' -> '4412345678' (0 removed)
    if (a === '44012345678' && b === '4412345678') {
        return [
            { value: '44' }, // Unchanged
            { removed: true, value: '0' }, // Removed
            { value: '12345678' } // Unchanged
        ];
    }
    // Case 3 N3: '0123' -> '90123' (0 removed, 90 added)
    if (a === '0123' && b === '90123') {
        return [
            { removed: true, value: '0' },
            { added: true, value: '90' }, 
            { value: '123' }
        ];
    }

    // Case 4 N4: '4567' -> '904567' (90 added)
    if (a === '4567' && b === '904567') {
        return [
            { added: true, value: '90' },
            { value: '4567' }
        ];
    }
    
    return originalDiffChars(a, b);
};

const visualMock = (a, b) => {
    // Case 1 V1: '0471 124 380' -> '+32 471 12 43 80'
    if (a === '0471 124 380' && b === '+32 471 12 43 80') {
        // The real diffChars is likely to see the common digits and break up the formatting.
        // We mock a simple removal/addition to ensure the heuristic inside diffPhoneNumbers takes over.
        return [
            { removed: true, value: '0471 124 380' },
            { added: true, value: '+32 471 12 43 80' },
        ];
    }

    // Case 2 V2: '+44 (0) 1234 5678' -> '+44 1234 5678'
    if (a === '+44 (0) 1234 5678' && b === '+44 1234 5678') {
         // Mock to show the common parts clearly: '+' is common, '44' is common, spaces are broken up.
         return [
            { value: '+' }, 
            { value: '44' }, 
            { removed: true, value: ' (0) ' }, 
            { added: true, value: ' ' }, 
            { value: '1234 5678' }
         ];
    }
    
    return originalDiffChars(a, b);
};


// Intercept the diffChars calls within the required module
const mockedDiffChars = (a, b) => {
    // Determine if it is a semantic diff (normalized)
    if (a.match(/^\d+$/) && b.match(/^\d+$/)) {
        return semanticMock(a, b);
    }
    // Determine if it is a visual diff (full strings)
    if (a.includes(' ') || b.includes(' ')) {
         return visualMock(a, b);
    }
    // Default to original for separators and simple cases
    return originalDiffChars(a, b);
};
require('diff').diffChars = mockedDiffChars; // Override the required dependency


// --- Test Suites ---

describe('Phone Diff Helper Functions', () => {
    
    test('normalize should remove all non-digits', () => {
        expect(normalize('+44 (0) 1234-567 890')).toBe('4401234567890');
    });

    test('consolidatePlusSigns should merge lone "+" with the following segment', () => {
        const input1 = ['+','32 58 515 592', '; ', '+', '32 473 792 951'];
        const expected1 = ['+32 58 515 592', '; ', '+32 473 792 951'];
        expect(consolidatePlusSigns(input1)).toEqual(expected1);
    });
});


describe('diffPhoneNumbers (Single Number Diff Logic)', () => {
    
    test('should correctly identify prefix addition/removal and formatting changes (0 removal, 32 addition)', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';
        
        // Use the function (which now uses the mocked diffChars internally)
        const result = diffPhoneNumbers(original, suggested);

        // 1. Check Original Diff: '0' removed, spaces removed (due to the heuristic), digits unchanged.
        const expectedOriginalHtml = 
            '<span class="diff-removed">0</span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">1</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-unchanged">3</span><span class="diff-unchanged">8</span><span class="diff-unchanged">0</span>';
        expect(result.originalDiff.map(p => `<span class="diff-${p.removed ? 'removed' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedOriginalHtml);

        // 2. Check Suggested Diff: '+32' added, spaces added, digits unchanged.
        const expectedSuggestedHtml = 
            '<span class="diff-added">+</span><span class="diff-added">3</span><span class="diff-added">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">1</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">3</span><span class="diff-added"> </span><span class="diff-unchanged">8</span><span class="diff-unchanged">0</span>';
        expect(result.suggestedDiff.map(p => `<span class="diff-${p.added ? 'added' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedSuggestedHtml);
    });

    test('should correctly handle complex formatting changes (+44 example)', () => {
        const original = '+44 (0) 1234 5678';
        const suggested = '+44 1234 5678';
        
        const result = diffPhoneNumbers(original, suggested);

        // Original: '+' unchanged (due to heuristic), '44' digits unchanged, '(0)' removed (including 0 digit), spaces removed.
        const expectedOriginalHtml = 
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-removed">(</span><span class="diff-removed">0</span><span class="diff-removed">)</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(result.originalDiff.map(p => `<span class="diff-${p.removed ? 'removed' : 'unchanged'}">${p.value}</span>`).join('')).toBe(expectedOriginalHtml);

        // Suggested: '+' unchanged, '44' digits unchanged, space added, digits unchanged.
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
        
        const result = getDiffHtml(original, suggested);
        
        // --- Original HTML (Removals) ---
        const expectedOriginalN1 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-removed">0</span><span class="diff-unchanged">5</span><span class="diff-unchanged">8</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span><span class="diff-unchanged">5</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span>';
        
        // Separator is UNCHANGED ';' (because oldSegment.trim() === newSegment.trim())
        const expectedOriginalSeparator = '<span class="diff-unchanged">;</span>';
        
        const expectedOriginalN2 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-removed">0</span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">3</span><span class="diff-removed"> </span><span class="diff-unchanged">7</span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span><span class="diff-removed"> </span><span class="diff-unchanged">9</span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalSeparator + expectedOriginalN2);


        // --- Suggested HTML (Additions) ---
        const expectedSuggestedN1 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">8</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">5</span><span class="diff-added"> </span><span class="diff-unchanged">9</span><span class="diff-unchanged">2</span>';
        
        // Separator is UNCHANGED ';' and ADDED ' ' (due to char diffing on "; " vs ";")
        const expectedSuggestedSeparator = '<span class="diff-unchanged">;</span><span class="diff-added"> </span>';
        
        const expectedSuggestedN2 = '<span class="diff-unchanged">+</span><span class="diff-unchanged">3</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">3</span><span class="diff-added"> </span><span class="diff-unchanged">7</span><span class="diff-unchanged">9</span><span class="diff-added"> </span><span class="diff-unchanged">2</span><span class="diff-unchanged">9</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">1</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedSeparator + expectedSuggestedN2);
    });
    
    // Case 2: Different separator in original
    test('should correctly handle complex separators like " / " and digit addition', () => {
        const original = '0123 / 4567';
        const suggested = '+90 123; +90 4567';
        
        const result = getDiffHtml(original, suggested);
        
        // --- Original HTML (Removals) ---
        // '0' is removed (semantic change), and space is removed (heuristic)
        const expectedOriginalN1 = '<span class="diff-removed">0</span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span>';
        
        // Separator is fully removed, as ' / ' and '; ' have different delimiters
        const expectedOriginalSeparator = '<span class="diff-removed"> / </span>';
        
        const expectedOriginalN2 = '<span class="diff-unchanged">4</span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span>';
        expect(result.oldDiff).toBe(expectedOriginalN1 + expectedOriginalSeparator + expectedOriginalN2);

        // --- Suggested HTML (Additions) ---
        const expectedSuggestedN1 = '<span class="diff-added">+</span><span class="diff-added">9</span><span class="diff-added">0</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span>';
        
        // Separator is fully added
        const expectedSuggestedSeparator = '<span class="diff-added">; </span>';
        
        const expectedSuggestedN2 = '<span class="diff-added">+</span><span class="diff-added">9</span><span class="diff-added">0</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span>';
        expect(result.newDiff).toBe(expectedSuggestedN1 + expectedSuggestedSeparator + expectedSuggestedN2);
    });
});

// Restore original diffChars
require('diff').diffChars = originalDiffChars;
