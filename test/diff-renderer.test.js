const { 
    normalize, 
    consolidatePlusSigns, 
    getPhoneDiffArray, // Core diff logic (returns array)
    renderDiffToHtml,    // HTML rendering logic (applies heuristic)
    getDiffHtml
} = require('../src/diff-renderer'); 

const { diff_match_patch } = require('diff-match-patch');

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


describe('getPhoneDiffArray (Core Diff Logic - Raw Array Output)', () => {
    
    // Type: -1=Removed, 0=Unchanged, 1=Added
    
    test('should return a granular diff array for prefix change and formatting change', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';
        
        const result = getPhoneDiffArray(original, suggested);
        
        // After semantic cleanup and the post-processing fix, the raw output correctly aligns 
        // common digits as unchanged (0), with formatting changes interleaved.
        // This array structure is necessary to generate the user's desired HTML output.
        expect(result).toEqual([
            [-1, "0"], [1, "+"], [1, "3"], [1, "2"], [1, " "], 
            [0, "4"], [0, "7"], [0, "1"], 
            [-1, " "], [1, " "], 
            [0, "1"], [0, "2"], 
            [0, "4"], // This digit is now UNCHANGED by post-processing
            [-1, " "], [1, " "], 
            [1, "4"], [1, "3"], // Added digits that are not common (part of new formatting)
            [1, " "], 
            [0, "3"], // This digit is now UNCHANGED by post-processing
            [0, "8"], [0, "0"], 
            [1, " "] // Trailing space in suggested: '+32 471 12 43 80'
        ]);
    });
});

describe('renderDiffToHtml (HTML Output Verification)', () => {

    test('should correctly identify prefix addition/removal and formatting changes (0 removal, 32 addition)', () => {
        const original = '0471 124 380';
        const suggested = '+32 471 12 43 80';
        
        const diffArray = getPhoneDiffArray(original, suggested);
        
        // 1. Check Original Diff: All common digits are correctly marked as UNCHANGED.
        const expectedOriginalHtml = 
            '<span class="diff-removed">0</span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">1</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-unchanged">3</span><span class="diff-unchanged">8</span><span class="diff-unchanged">0</span>';
        expect(renderDiffToHtml(diffArray, 'original')).toBe(expectedOriginalHtml);

        // 2. Check Suggested Diff: '+32' added, spaces added/changed, digits unchanged.
        const expectedSuggestedHtml = 
            '<span class="diff-added">+</span><span class="diff-added">3</span><span class="diff-added">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-unchanged">7</span><span class="diff-unchanged">1</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-added"> </span><span class="diff-unchanged">4</span><span class="diff-added">3</span><span class="diff-added"> </span><span class="diff-unchanged">8</span><span class="diff-unchanged">0</span><span class="diff-added"> </span>';
        expect(renderDiffToHtml(diffArray, 'suggested')).toBe(expectedSuggestedHtml);
    });

    test('should correctly handle complex formatting changes (+44 example)', () => {
        const original = '+44 (0) 1234 5678';
        const suggested = '+44 1234 5678';
        
        const diffArray = getPhoneDiffArray(original, suggested);

        // Original: +44 (0) 1234 5678
        const expectedOriginalHtml = 
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-removed">(</span><span class="diff-removed">0</span><span class="diff-removed">)</span><span class="diff-removed"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-removed"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(renderDiffToHtml(diffArray, 'original')).toBe(expectedOriginalHtml);

        // Suggested: +44 1234 5678
        const expectedSuggestedHtml = 
            '<span class="diff-unchanged">+</span><span class="diff-unchanged">4</span><span class="diff-unchanged">4</span><span class="diff-added"> </span><span class="diff-unchanged">1</span><span class="diff-unchanged">2</span><span class="diff-unchanged">3</span><span class="diff-unchanged">4</span><span class="diff-added"> </span><span class="diff-unchanged">5</span><span class="diff-unchanged">6</span><span class="diff-unchanged">7</span><span class="diff-unchanged">8</span>';
        expect(renderDiffToHtml(diffArray, 'suggested')).toBe(expectedSuggestedHtml);
    });
});
