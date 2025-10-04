const { promises: fsPromises } = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./constants');
const { translate } = require('./i18n');
const {favicon, themeButton, createFooter, createStatsBox} = require('./html-utils');
const { safeName } = require('./data-processor');

/**
 * Creates the renderListScript for the country index page.
 * @param {Object} groupedDivisionStats
 * @param {string} locale
 * @returns {string}
 */
function createRenderListScript(groupedDivisionStats, locale) {
    // --- Server-side translation of dynamic client script strings ---
    // These strings are translated on the server and embedded as literals in the script.
    const T = {
        invalidNumbersOutOf: translate('invalidNumbersOutOf', locale), // e.g., "%i invalid numbers (%f potentially fixable) out of %t"
        invalid: translate('invalid', locale),
        hideEmptyDivisions: translate('hideEmptyDivisions', locale),
        sortBy: translate('sortBy', locale),
        invalidPercentage: translate('invalidPercentage', locale),
        invalidCount: translate('invalidCount', locale),
        name: translate('name', locale),
        noSubdivisionsFound: translate('noSubdivisionsFound', locale)
    };
    // -----------------------------------------------------------------

    return `
    <script>
        const groupedDivisionStats = ${JSON.stringify(groupedDivisionStats)};
        const listContainer = document.getElementById('division-list');
        const sortButtons = document.querySelectorAll('.sort-btn');
        const hideEmptyCheckbox = document.getElementById('hide-empty');
        let currentSort = 'percentage';
        const locale = '${locale}'; 

        // Embedded translated string literals from the server-side 'T' object
        const T_CLIENT = {
            invalidNumbersOutOf: \`${T.invalidNumbersOutOf}\`,
            invalid: \`${T.invalid}\`,
            noSubdivisionsFound: \`${T.noSubdivisionsFound}\`
        };

        // Utility function for consistent number formatting
        function formatNumber(num) {
            // Ensure the number formatting respects the locale for grouping
            return num.toLocaleString(locale, { 
                useGrouping: true, 
                minimumFractionDigits: 0, 
                maximumFractionDigits: 0 
            });
        }

        // Pre-calculate total stats for each division group 
        const calculatedDivisionTotals = {};
        for (const divisionName in groupedDivisionStats) {
            let groupInvalid = 0;
            let groupTotal = 0;
            let groupFixable = 0;
            groupedDivisionStats[divisionName].forEach(stat => {
                groupInvalid += stat.invalidCount;
                groupTotal += stat.totalNumbers;
                groupFixable += stat.autoFixableCount;
            });
            calculatedDivisionTotals[divisionName] = {
                invalid: groupInvalid,
                total: groupTotal,
                fixable: groupFixable
            };
        }

        function updateButtonStyles() {
            const isDark = document.documentElement.classList.contains('dark');
            sortButtons.forEach(button => {
                const isActive = button.dataset.sort === currentSort;
                button.classList.toggle('sort-btn-style-active', isActive);
                button.classList.toggle('sort-btn-style-inactive', !isActive);
            });
        }

        // Function to create the collapsible icon (right-pointing arrow)
        function createCollapseIcon() {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'collapse-icon');
            svg.setAttribute('fill', 'currentColor');
            svg.setAttribute('viewBox', '0 0 20 20');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill-rule', 'evenodd');
            path.setAttribute('d', 'M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z');
            path.setAttribute('clip-rule', 'evenodd');
            svg.appendChild(path);
            return svg;
        }

        function renderList() {
            const TARGET_LI_CLASS = 'list-item';

            let divisionNames = Object.keys(groupedDivisionStats);

            // Sort the division groups themselves based on the current sort order
            divisionNames.sort((a, b) => {
                if (currentSort === 'percentage') {
                    const statsA = calculatedDivisionTotals[a];
                    const statsB = calculatedDivisionTotals[b];
                    const percentageA = statsA.total > 0 ? (statsA.invalid / statsA.total) : 0;
                    const percentageB = statsB.total > 0 ? (statsB.invalid / statsB.total) : 0;
                    return percentageB - percentageA;
                } else if (currentSort === 'invalidCount') {
                    return calculatedDivisionTotals[b].invalid - calculatedDivisionTotals[a].invalid;
                } else if (currentSort === 'name') {
                    return a.localeCompare(b);
                }
                return 0;
            });
            const isGrouped = divisionNames.length > 1;

            const percentageOptions = {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            };

            // Capture current open state
            const currentlyOpenDivisions = new Set();
            listContainer.querySelectorAll('details').forEach(details => {
                if (details.open) {
                    const divisionHeader = details.querySelector('h3');
                    if (divisionHeader) {
                        currentlyOpenDivisions.add(divisionHeader.textContent.trim());
                    }
                }
            });

            listContainer.innerHTML = '';

            for (const divisionName of divisionNames) {
                let sortedData = [...groupedDivisionStats[divisionName]];

                if (hideEmptyCheckbox.checked) {
                    sortedData = sortedData.filter(subdivision => subdivision.invalidCount > 0);
                }

                if (sortedData.length > 0) {

                    // --- Group Stats Calculation ---
                    const groupStats = calculatedDivisionTotals[divisionName];
                    const groupInvalidFormatted = formatNumber(groupStats.invalid);
                    const groupTotalFormatted = formatNumber(groupStats.total);
                    const groupFixableFormatted = formatNumber(groupStats.fixable); 

                    const groupPercentageNumber = groupStats.total > 0 ? (groupStats.invalid / groupStats.total) * 100 : 0;
                    const formattedGroupPercentage = groupPercentageNumber.toLocaleString(locale, percentageOptions);
                    
                    // Client-side substitution using the embedded template literal
                    const groupStatsLine = T_CLIENT.invalidNumbersOutOf
                        .replace('%i', groupInvalidFormatted)
                        .replace('%f', groupFixableFormatted)
                        .replace('%t', groupTotalFormatted);

                    // --- End Group Stats Calculation ---

                    sortedData.sort((a, b) => {
                        if (currentSort === 'percentage') {
                            const percentageA = a.totalNumbers > 0 ? (a.invalidCount / a.totalNumbers) : 0;
                            const percentageB = b.totalNumbers > 0 ? (b.invalidCount / b.totalNumbers) : 0;
                            return percentageB - percentageA;
                        } else if (currentSort === 'invalidCount') {
                            return b.invalidCount - a.invalidCount;
                        } else if (currentSort === 'name') {
                            return a.name.localeCompare(b.name);
                        }
                    });

                    let ul;

                    if (isGrouped) {
                        // --- RENDER GROUPED ---
                        let detailsGroup = document.createElement('details'); 
                        detailsGroup.className = 'details-group group';

                        // Restore open state after sort
                        if (currentlyOpenDivisions.has(divisionName)) {
                            detailsGroup.open = true;
                        }

                        const summaryHeader = document.createElement('summary');
                        summaryHeader.className = 'summary-header group/summary';

                        const summaryContent = document.createElement('div');
                        summaryContent.className = 'summary-content';

                        const leftSide = document.createElement('div');
                        leftSide.className = 'summary-left-side';

                        const iconCircle = document.createElement('div'); 
                        iconCircle.className = 'summary-icon color-indicator';
                        iconCircle.setAttribute('data-percentage', groupPercentageNumber);

                        const collapseIcon = createCollapseIcon();
                        iconCircle.appendChild(collapseIcon); 

                        const divisionNameContainer = document.createElement('div');
                        divisionNameContainer.className = 'list-item-content';

                        const divisionHeader = document.createElement('h3');
                        divisionHeader.className = 'summary-title';
                        divisionHeader.textContent = divisionName;

                        const statsLine = document.createElement('p');
                        statsLine.className = 'summary-stats';
                        // Use the dynamically generated translated string
                        statsLine.textContent = groupStatsLine;

                        divisionNameContainer.appendChild(divisionHeader);
                        divisionNameContainer.appendChild(statsLine);

                        leftSide.appendChild(iconCircle); 
                        leftSide.appendChild(divisionNameContainer);

                        const rightSide = document.createElement('div');
                        rightSide.className = 'summary-right-side';

                        const percentageText = document.createElement('p');
                        percentageText.className = 'summary-percentage';
                        percentageText.innerHTML = \`\${formattedGroupPercentage}<span class="country-percentage-symbol">%</span>\`;

                        const percentageLabel = document.createElement('p');
                        percentageLabel.className = 'summary-percentage-label';
                        percentageLabel.textContent = T_CLIENT.invalid; 

                        rightSide.appendChild(percentageText);
                        rightSide.appendChild(percentageLabel);

                        summaryContent.appendChild(leftSide);
                        summaryContent.appendChild(rightSide);

                        summaryHeader.appendChild(summaryContent);

                        detailsGroup.appendChild(summaryHeader);

                        ul = document.createElement('ul'); 
                        ul.className = 'details-content';

                        detailsGroup.appendChild(ul);
                        listContainer.appendChild(detailsGroup);

                    } else {
                        // --- RENDER FLAT LIST ---
                        ul = listContainer; 
                    }

                    // --- LIST ITEM RENDERING (Common Logic) ---
                    sortedData.forEach(subdivision => {
                        const subdivisionSlug = subdivision.slug;
                        const percentage = subdivision.totalNumbers > 0 ? (subdivision.invalidCount / subdivision.totalNumbers) * 100 : 0;
                        const invalidPercentage = Math.max(0, Math.min(100, percentage));

                        const formattedInvalidCount = formatNumber(subdivision.invalidCount);
                        const formattedFixableCount = formatNumber(subdivision.autoFixableCount);
                        const formattedTotalCount = formatNumber(subdivision.totalNumbers);

                        const percentageNumber = subdivision.totalNumbers > 0 ? (subdivision.invalidCount / subdivision.totalNumbers) * 100 : 0;
                        const formattedPercentage = percentageNumber.toLocaleString(locale, percentageOptions);
                        
                        // Client-side substitution using the embedded template literal
                        const itemStatsLine = T_CLIENT.invalidNumbersOutOf
                            .replace('%i', formattedInvalidCount)
                            .replace('%f', formattedFixableCount)
                            .replace('%t', formattedTotalCount);


                        const li = document.createElement('li');
                        li.className = 'report-list-item';

                        li.innerHTML = \`
                            <a href="\${subdivision.divisionSlug}/\${subdivisionSlug}.html" class="list-item-main-link">
                                <div class="color-indicator" data-percentage="\${invalidPercentage}"></div>
                                <div class="list-item-content-wrapper">
                                    <h3 class="list-item-sub-title">\${subdivision.name}</h3>
                                    <p class="country-description">\${itemStatsLine}</p>
                                </div>
                            </a>
                            <div class="summary-right-side">
                                <p class="summary-percentage">\${formattedPercentage}<span class="country-percentage-symbol">%</span></p>
                                <p class="summary-percentage-label">\${T_CLIENT.invalid}</p>
                            </div>
                        \`;
                        ul.appendChild(li);
                    });
                    // --- END LIST ITEM RENDERING ---
                }
            }

            if (listContainer.querySelectorAll('li').length === 0) {
                listContainer.innerHTML = '';
                const li = document.createElement('li');
                li.className = 'no-subdivisions-item';
                // Use the translated fallback message
                li.textContent = T_CLIENT.noSubdivisionsFound;
                listContainer.appendChild(li);
            }
            updateButtonStyles();
            applyColors(); // update circle styling
        }

        sortButtons.forEach(button => {
            button.addEventListener('click', () => {
                currentSort = button.dataset.sort;
                renderList();
            });
        });

        hideEmptyCheckbox.addEventListener('change', renderList);

        renderList();
    </script>
    `;
}

/**
 * Generates the country index page with a list of its subdivisions.
 * @param {Object} countryData
 * @param {Object} translations
 */
async function generateCountryIndexHtml(countryData, translations) {
    const locale = countryData.locale;
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [countryData.name])}</title>
        ${favicon}
        <link href="../styles.css" rel="stylesheet">
        <script src="../theme.js"></script>
    </head>
    <body class="body-styles">
        <div class="page-container">
            <header class="page-header">
                <div class="absolute top-0 right-0">
                    ${themeButton}
                </div>
                <a href="../" class="back-link">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToAllCountries', locale)}</span>
                </a>
                <h1 class="page-title">${translate('osmPhoneNumberValidation', locale)}</h1>
                <p class="report-subtitle">${translate('reportSubtitle', locale, [countryData.name])}</p>
            </header>
            ${createStatsBox(countryData.totalNumbers, countryData.invalidCount, countryData.autoFixableCount, locale)}
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${translate('divisionalReports', locale)}</h2>
                    <div class="card-actions">
                        <div class="sort-controls">
                            <span class="sort-label">${translate('sortBy', locale)}</span>
                            <button id="sort-percentage" data-sort="percentage" class="sort-btn sort-btn-style">${translate('invalidPercentage', locale)}</button>
                            <button id="sort-invalid" data-sort="invalidCount" class="sort-btn sort-btn-style">${translate('invalidCount', locale)}</button>
                            <button id="sort-name" data-sort="name" class="sort-btn sort-btn-style">${translate('name', locale)}</button>
                        </div>
                        <div class="checkbox-container">
                            <label for="hide-empty" class="checkbox-label">${translate('hideEmptyDivisions', locale)}</label>
                            <input type="checkbox" id="hide-empty" checked class="checkbox-input">
                        </div>
                    </div>
                </div>
                <div id="division-list" class="space-y-4">
                </div>
            </div>
            <div class="footer-container">
                ${createFooter(locale, translations)}
            </div>
        </div>
        ${createRenderListScript(countryData.groupedDivisionStats, locale)}
        <script src="./backgroundColor.js"></script>
    </body>
    </html>
    `;
    pageFileName = path.join(PUBLIC_DIR, countryData.slug, 'index.html')
    await fsPromises.writeFile(pageFileName, htmlContent);
    console.log(`Report for ${countryData.name} generated at ${pageFileName}.`);
}

module.exports = {
    generateCountryIndexHtml,
};