const { promises: fsPromises } = require('fs');
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./constants');
const { safeName, getFeatureTypeName } = require('./data-processor');
const { translate } = require('./i18n');

const githubLink = "https://github.com/arrival-spring/osm-phones/"
const favicon = '<link rel="icon" href="data:image/svg+xml,&lt;svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22&gt;&lt;text y=%22.9em%22 font-size=%2290%22&gt;📞&lt;/text&gt;&lt;/svg&gt;">';

/**
 * Creates the HTML box displaying statistics.
 * @param {number} total - Total phone numbers
 * @param {number} invalid - Number of invalid numbers
 * @param {number} fixable - Number of autofixable numbers
 * @param {string} locale - Locale to display numbers in
 * @returns {string}
 */
function createStatsBox(total, invalid, fixable, locale) {
    const percentageOptions = {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    };
    const totalPercentageNumber = total > 0 ? (invalid / total) * 100 : 0;
    const fixablePercentageNumber = invalid > 0 ? (fixable / invalid) * 100 : 0;

    const formattedTotal = total.toLocaleString(locale);
    const formattedInvalid = invalid.toLocaleString(locale);
    const formattedFixable = fixable.toLocaleString(locale);

    const formattedTotalPercentage = totalPercentageNumber.toLocaleString(locale, percentageOptions);
    const formattedFixablePercentage = fixablePercentageNumber.toLocaleString(locale, percentageOptions);

    return `
        <div class="bg-white rounded-xl shadow-lg p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
                <p class="text-4xl font-extrabold text-gray-800">${formattedTotal}</p>
                <p class="text-sm text-gray-500">${translate('numbersChecked', locale)}</p>
            </div>
            <div>
                <p class="text-4xl font-extrabold text-blue-700">${formattedInvalid}</p>
                <p class="text-gray-500">${translate('invalidNumbers', locale)}</p>
                <p class="text-sm text-gray-400">${translate('invalidPercentageOfTotal', locale, [formattedTotalPercentage])}</p>
            </div>
            <div>
                <p class="text-4xl font-extrabold text-green-700">${formattedFixable}</p>
                <p class="text-gray-500">${translate('potentiallyFixable', locale)}</p>
                <p class="text-sm text-gray-400">${translate('fixablePercentageOfInvalid', locale, [formattedFixablePercentage])}</p>
            </div>
        </div>
    `;
}

/**
 * Creates the HTML footer with data timestamp and GitHub link.
 * @param {string} locale - Locale to format the date in
 * @param {Object} translations - The translations dictionary for the current locale
 * @returns {string}
 */
function createFooter(locale = 'en-GB', translations) {
    translations = translations || {};

    const dataTimestamp = new Date();
    // Formatting the date and time
    const formattedDate = dataTimestamp.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = dataTimestamp.toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    });

    // Use translation keys for static text, with fallbacks to hardcoded text
    const dataSourcedTemplate = translations['dataSourcedTemplate'] || 'Data sourced on %d at %t %z (%a)';
    const suggestionIssueLink = translate('suggestionIssueLink', locale);
    const letMeKnowOnGitHub = translate('letMeKnowOnGitHub');
    const timeAgoJustNow = translate('timeAgoJustNow');

    const initialTimeAgoText = translate('calculating', locale);
    const footerText = translate('dataSourcedTemplate', locale, [formattedDate, formattedTime, 'UTC', `<span id="time-ago-display">${initialTimeAgoText}</span>`]);

    return `
    <p id="data-timestamp-container" 
       class="text-sm text-gray-500 mt-2"
       data-timestamp="${dataTimestamp.getTime()}">
        ${dataSourcedTemplate
            .replace('%d', formattedDate)
            .replace('%t', formattedTime)
            .replace('%z', 'UTC')
            .replace('%a', timeAgoJustNow)
        }
    </p>
    <p class="text-sm text-gray-500 mt-2">${suggestionIssueLink} <a href="${githubLink}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 underline transition-colors">${letMeKnowOnGitHub}</a>.</p>
    
    <script>
        // Embed the translations object for client-side use
        const translations = ${JSON.stringify(translations)};
        
        function translate(key, substitutions = {}) {
            let str = translations[key] || \`MISSING_KEY:\${key}\`;
            // Simple substitution utility for %n placeholders
            if (str.includes('%n') && substitutions['%n'] !== undefined) {
                str = str.replace('%n', substitutions['%n']);
            }
            return str;
        }

        function updateTimeAgo() {
            const container = document.getElementById('data-timestamp-container');
            
            if (!container) {
                return;
            }

            const dataTimestampMs = parseInt(container.getAttribute('data-timestamp'), 10);
            if (isNaN(dataTimestampMs)) {
                container.textContent = translations['timeAgoError'] || 'error in time calculation';
                return;
            }

            const dataDate = new Date(dataTimestampMs);
            const now = new Date();
            
            const millisecondsAgo = now.getTime() - dataDate.getTime();
            
            const totalMinutes = Math.floor(millisecondsAgo / (1000 * 60));
            
            let timeAgoText;

            if (totalMinutes < 1) {
                timeAgoText = translate('timeAgoJustNow');
            } else if (totalMinutes < 60) {
                const minutes = totalMinutes;
                // Use plural/singular keys with substitution
                const key = minutes > 1 ? 'timeAgoMinutesPlural' : 'timeAgoMinute';
                timeAgoText = translate(key, { '%n': minutes }); 
            } else {
                const hours = Math.floor(totalMinutes / 60);
                // Use plural/singular keys with substitution
                const key = hours > 1 ? 'timeAgoHoursPlural' : 'timeAgoHour';
                timeAgoText = translate(key, { '%n': hours }); 
            }

            // Re-render the full string using the translated template
            const dataSourcedTemplate = translations['dataSourcedTemplate'] || 'Data sourced on %d at %t %z (%a)';

            container.innerHTML = dataSourcedTemplate
                .replace('%d', '${formattedDate}')
                .replace('%t', '${formattedTime}')
                .replace('%z', 'UTC')
                .replace('%a', timeAgoText); 
        }

        // Run immediately when the script loads
        updateTimeAgo();

        // Set an interval to run every 60 seconds (1 minute) to keep the time updated
        setInterval(updateTimeAgo, 60000);
    </script>
    `
}

/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @returns {string}
 */
function createListItem(item, locale) {
    const josmBaseUrl = 'http://127.0.0.1:8111/load_object';
    const idBaseUrl = 'https://www.openstreetmap.org/edit?editor=id&map=19/';

    const phoneNumber = item.invalidNumbers;
    const fixedNumber = item.suggestedFixes.join('; ');
    const idEditUrl = `${idBaseUrl}${item.lat}/${item.lon}&${item.type}=${item.id}`;
    const josmEditUrl = `${josmBaseUrl}?objects=${item.type}${item.id}`;
    const josmFixUrl = item.autoFixable ? `${josmEditUrl}&addtags=${item.tag}=${encodeURIComponent(fixedNumber)}` : null;

    const idEditButton = `<a href="${idEditUrl}" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors" target="_blank">${translate('editInID', locale)}</a>`;
    const josmEditButton = `<a href="#" onclick="fixWithJosm('${josmEditUrl}', event)" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors">${translate('editInJOSM', locale)}</a>`;
    const josmFixButton = josmFixUrl ? `<a href="#" onclick="fixWithJosm('${josmFixUrl}', event)" class="inline-flex items-center rounded-full bg-yellow-200 px-3 py-1.5 text-sm font-semibold text-yello-800 shadow-sm hover:bg-yellow-300 transition-colors">${translate('fixInJOSM', locale)}</a>` : '';
    const websiteButton = item.website ? `<a href="${item.website}" class="inline-flex items-center rounded-full bg-green-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-600 transition-colors" target="_blank">${translate('website', locale)}</a>` : '';

    return `
        <li class="bg-white rounded-xl shadow-md p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <div>
                <h3 class="text-lg font-bold text-gray-900">
                    <a href="${item.osmUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-gray-950 underline transition-colors">${getFeatureTypeName(item)}</a>
                </h3>
                <div class="grid grid-cols-[max-content,1fr] gap-x-4">
                    <div class="col-span-1">
                        <span class="font-semibold">${translate('phone', locale)}</span>
                    </div>
                    <div class="col-span-1">
                        <span>${phoneNumber}</span>
                    </div>
                    ${item.autoFixable ? `
                    <div class="col-span-1">
                        <span class="font-semibold">${translate('suggestedFix', locale)}</span>
                    </div>
                    <div class="col-span-1">
                        <span>${fixedNumber}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="flex-shrink-0 flex flex-wrap items-center gap-2">
                ${websiteButton}
                ${josmFixButton}
                ${idEditButton}
                ${josmEditButton}
            </div>
        </li>
    `;
}

/**
 * Generates the HTML report for a single subdivision.
 * @param {string} countryName
 * @param {Object} subdivision - The subdivision object.
 * @param {Array<Object>} invalidNumbers - List of invalid items.
 * @param {number} totalNumbers - Total number of phone tags checked.
 * @param {string} locale
 * @param {Object} translations
 */
async function generateHtmlReport(countryName, subdivision, invalidNumbers, totalNumbers, locale, translations) {
    const safeSubdivisionName = safeName(subdivision.name);
    const safeCountryName = safeName(countryName);
    const filePath = path.join(PUBLIC_DIR, safeCountryName, `${safeSubdivisionName}.html`);

    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);
    const manualFixNumbers = invalidNumbers.filter(item => !item.autoFixable);

    const fixableListContent = autofixableNumbers.length > 0 ?
        autofixableNumbers.map(item => createListItem(item, locale)).join('') :
        `<li class="bg-white rounded-xl shadow-md p-6 text-center text-gray-500">${translate('noAutoFixable', locale)}</li>`;

    const invalidListContent = manualFixNumbers.length > 0 ?
        manualFixNumbers.map(item => createListItem(item, locale)).join('') :
        `<li class="bg-white rounded-xl shadow-md p-6 text-center text-gray-500">${translate('noInvalidNumbers', locale)}</li>`;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}"> 
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [countryName])}</title>
        ${favicon}
        <link href="../styles.css" rel="stylesheet">
        <style>
            body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-4xl mx-auto space-y-8">
            <header class="text-center">
                <a href="../${safeCountryName}.html" class="inline-block mb-4 text-blue-500 hover:text-blue-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToCountryPage', locale)}</span>
                </a>
                <h1 class="text-4xl font-extrabold text-gray-900">${translate('phoneNumberReport', locale)}</h1>
                <h2 class="text-2xl font-semibold text-gray-700 mt-2">${subdivision.name}</h2>
            </header>
            ${createStatsBox(totalNumbers, invalidNumbers.length, autofixableNumbers.length, locale)}
            <div class="text-center">
                <h2 class="text-2xl font-semibold text-gray-900">${translate('fixableNumbersHeader', locale)}</h2>
                <p class="text-sm text-gray-500 mt-2">${translate('fixableNumbersDescription', locale)}</p>
            </div>
            <ul class="space-y-4">
                ${fixableListContent}
            </ul>
            <div class="text-center">
                <h2 class="text-2xl font-semibold text-gray-900">${translate('invalidNumbersHeader', locale)}</h2>
                <p class="text-sm text-gray-500 mt-2">${translate('invalidNumbersDescription', locale)}</p>
            </div>
            <ul class="space-y-4">
                ${invalidListContent}
            </ul>
            <div class="bg-white rounded-xl shadow-lg p-2 text-center">
                ${createFooter(locale, translations)}
            </div>
        </div>
    <script>
        function fixWithJosm(url, event) {
            event.preventDefault();
            fetch(url)
                .then(response => {
                    if (response.ok) {
                        console.log('JOSM command sent successfully.');
                    } else {
                        console.error('Failed to send command to JOSM. Please ensure JOSM is running with Remote Control enabled.');
                    }
                })
                .catch(error => {
                    console.error('Could not connect to JOSM Remote Control. Please ensure JOSM is running.', error);
                });
        }
    </script>
    </body>
    </html>
    `;
    await fsPromises.writeFile(filePath, htmlContent);
    console.log(`Generated report for ${subdivision.name} at ${filePath}`);
}

/**
 * Generates the main index.html file listing all country reports.
 * @param {Array<Object>} countryStats - Array of country statistic objects, including country.locale.
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 * @param {Object} translations
 */
function generateMainIndexHtml(countryStats, locale = 'en-GB', translations) {

    // We will use the 'locale' parameter (e.g., 'en') for the page structure.

    const listContent = countryStats.map(country => {
        const safeCountryName = safeName(country.name);
        const countryPageName = `${safeCountryName}.html`;
        const percentage = country.totalNumbers > 0 ? (country.invalidCount / country.totalNumbers) * 100 : 0;
        const validPercentage = Math.max(0, Math.min(100, percentage));

        // Use the country's specific locale for number formatting and description text
        const itemLocale = country.locale || locale; // Fallback to the main page locale

        function getBackgroundColor(percent) {
            if (percent > 2) {
                return `hsl(0, 70%, 50%)`;
            }
            const hue = ((2 - percent) / 2) * 120;
            return `hsl(${hue}, 70%, 50%)`;
        }
        const backgroundColor = getBackgroundColor(validPercentage);

        // Format numbers using the *country's* specific locale
        const formattedInvalid = country.invalidCount.toLocaleString(itemLocale);
        const formattedFixable = country.autoFixableCount.toLocaleString(itemLocale);
        const formattedTotal = country.totalNumbers.toLocaleString(itemLocale);

        // Use the country's specific locale for the description translation
        const description = translate('invalidNumbersOutOf', itemLocale, [formattedInvalid, formattedFixable, formattedTotal]);

        return `
            <a href="${countryPageName}" class="bg-white rounded-xl shadow-lg p-6 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 transition-transform transform hover:scale-105">
                <div class="flex-grow flex items-center space-x-4">
                    <div class="h-12 w-12 rounded-full flex-shrink-0" style="background-color: ${backgroundColor};"></div>
                    <div class="flex-grow">
                        <h3 class="text-xl font-bold text-gray-900">${country.name}</h3>
                        <p class="text-sm text-gray-500">${formattedInvalid} ${description}</p>
                    </div>
                </div>
                <div class="text-center sm:text-right">
                    <p class="text-2xl font-bold text-gray-800">${validPercentage.toLocaleString(itemLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span class="text-base font-normal">%</span></p>
                    <p class="text-xs text-gray-500">${translate('invalid', itemLocale)}</p>
                </div>
            </a>
        `;
    }).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('mainIndexTitle', locale)}</title>
        ${favicon}
        <link href="./styles.css" rel="stylesheet">
        <style>
            body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-5xl mx-auto space-y-8">
            <header class="text-center space-y-2">
                <h1 class="text-4xl font-extrabold text-gray-900">${translate('osmPhoneNumberValidation', locale)}</h1>
                <p class="text-sm text-gray-500">${translate('reportSubtitle', locale)}</p>
            </header>
            <div class="bg-white rounded-xl shadow-lg p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">${translate('countryReports', locale)}</h2>
                </div>
                <div class="space-y-4">
                    ${listContent}
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-lg p-2 text-center">
                ${createFooter(locale, translations)}
            </div>
        </div>
    </body>
    </html>
    `;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), htmlContent);
    console.log('Main index.html generated.');
}

/**
 * Generates the country index page with a list of its subdivisions.
 * @param {string} countryName
 * @param {Object} groupedDivisionStats
 * @param {number} totalInvalidCount
 * @param {number} totalAutofixableCount
 * @param {number} totalTotalNumbers
 * @param {string} locale
 * @param {Object} translations
 */
function generateCountryIndexHtml(countryName, groupedDivisionStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers, locale, translations) {
    const safeCountryName = safeName(countryName);

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

    const renderListScript = `
        <script>
            const groupedDivisionStats = ${JSON.stringify(groupedDivisionStats)};
            const safeCountryName = '${safeCountryName}';
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
            
            // Client-side color calculation logic (duplicated for client script access)
            function getBackgroundColor(percent) {
                if (percent > 2) {
                    return \`hsl(0, 70%, 50%)\`;
                }
                const hue = ((2 - percent) / 2) * 120;
                return \`hsl(\${hue}, 70%, 50%)\`;
            }

            // Calculates the colour for the division group header
            function getGroupBackgroundColorClient(invalidCount, totalNumbers) {
                if (totalNumbers === 0) return 'hsl(0, 0%, 90%)';
                const percentage = (invalidCount / totalNumbers) * 100;
                return getBackgroundColor(percentage);
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
                sortButtons.forEach(button => {
                    if (button.dataset.sort === currentSort) {
                        button.classList.add('bg-blue-500', 'text-white', 'shadow');
                        button.classList.remove('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300');
                    } else {
                        button.classList.remove('bg-blue-500', 'text-white', 'shadow');
                        button.classList.add('bg-gray-200', 'text-gray-800', 'hover:bg-gray-300');
                    }
                });
            }

            // Function to create the collapsible icon (right-pointing arrow)
            function createCollapseIcon() {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'h-6 w-6 transform transition-transform duration-200 group-open:rotate-90 group-hover/summary:scale-110 text-white'); 
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

                const TARGET_LI_CLASS = 'bg-white rounded-xl shadow-lg p-6 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 transition-transform transform hover:scale-105';

                const divisionNames = Object.keys(groupedDivisionStats);
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
                        sortedData = sortedData.filter(division => division.invalidCount > 0);
                    }

                    if (sortedData.length > 0) {

                        // --- Group Stats Calculation ---
                        const groupStats = calculatedDivisionTotals[divisionName];
                        const groupInvalidFormatted = formatNumber(groupStats.invalid);
                        const groupTotalFormatted = formatNumber(groupStats.total);
                        const groupFixableFormatted = formatNumber(groupStats.fixable); 

                        const groupPercentageNumber = groupStats.total > 0 ? (groupStats.invalid / groupStats.total) * 100 : 0;
                        const formattedGroupPercentage = groupPercentageNumber.toLocaleString(locale, percentageOptions);

                        const groupBgColor = getGroupBackgroundColorClient(groupStats.invalid, groupStats.total);
                        
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
                            detailsGroup.className = 'group mt-8 border border-gray-200 rounded-xl shadow-lg';

                            // Restore open state after sort
                            if (currentlyOpenDivisions.has(divisionName)) {
                                detailsGroup.open = true;
                            }

                            const summaryHeader = document.createElement('summary');
                            summaryHeader.className = 'list-none cursor-pointer p-6 flex transition-colors rounded-t-xl group/summary bg-gray-50 hover:bg-gray-100'; 

                            const summaryContent = document.createElement('div');
                            summaryContent.className = 'flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 w-full';

                            const leftSide = document.createElement('div');
                            leftSide.className = 'flex-grow flex items-center space-x-4 w-full sm:w-auto'; 

                            const iconCircle = document.createElement('div'); 
                            iconCircle.className = 'h-12 w-12 rounded-full flex-shrink-0 flex items-center justify-center';
                            iconCircle.style.backgroundColor = groupBgColor;

                            const collapseIcon = createCollapseIcon();
                            iconCircle.appendChild(collapseIcon); 

                            const divisionNameContainer = document.createElement('div');
                            divisionNameContainer.className = 'flex-grow'; 

                            const divisionHeader = document.createElement('h3');
                            divisionHeader.className = 'text-2xl font-bold text-gray-900'; 
                            divisionHeader.textContent = divisionName;

                            const statsLine = document.createElement('p');
                            statsLine.className = 'text-sm text-gray-500'; 
                            // Use the dynamically generated translated string
                            statsLine.textContent = groupStatsLine;

                            divisionNameContainer.appendChild(divisionHeader);
                            divisionNameContainer.appendChild(statsLine);

                            leftSide.appendChild(iconCircle); 
                            leftSide.appendChild(divisionNameContainer);

                            const rightSide = document.createElement('div');
                            rightSide.className = 'text-center sm:text-right flex-shrink-0 w-full sm:w-auto';

                            const percentageText = document.createElement('p');
                            percentageText.className = 'text-2xl font-bold text-gray-800';
                            percentageText.innerHTML = \`\${formattedGroupPercentage}<span class="text-base font-normal">%</span>\`;

                            const percentageLabel = document.createElement('p');
                            percentageLabel.className = 'text-xs text-gray-500';
                            percentageLabel.textContent = T_CLIENT.invalid; 

                            rightSide.appendChild(percentageText);
                            rightSide.appendChild(percentageLabel);

                            summaryContent.appendChild(leftSide);
                            summaryContent.appendChild(rightSide);

                            summaryHeader.appendChild(summaryContent);

                            detailsGroup.appendChild(summaryHeader);

                            ul = document.createElement('ul'); 
                            ul.className = 'space-y-4 p-4 border-t border-gray-200';

                            detailsGroup.appendChild(ul);
                            listContainer.appendChild(detailsGroup);

                        } else {
                            // --- RENDER FLAT LIST ---
                            ul = listContainer; 
                        }

                        // --- LIST ITEM RENDERING (Common Logic) ---
                        sortedData.forEach(division => {
                            const safeDivisionName = division.name.replace(/\\s+|\\//g, '-').toLowerCase();
                            const percentage = division.totalNumbers > 0 ? (division.invalidCount / division.totalNumbers) * 100 : 0;
                            const validPercentage = Math.max(0, Math.min(100, percentage));
                            const backgroundColor = getBackgroundColor(validPercentage);

                            const formattedInvalidCount = formatNumber(division.invalidCount);
                            const formattedFixableCount = formatNumber(division.autoFixableCount);
                            const formattedTotalCount = formatNumber(division.totalNumbers);

                            const percentageNumber = division.totalNumbers > 0 ? (division.invalidCount / division.totalNumbers) * 100 : 0;
                            const formattedPercentage = percentageNumber.toLocaleString(locale, percentageOptions);
                            
                            // Client-side substitution using the embedded template literal
                            const itemStatsLine = T_CLIENT.invalidNumbersOutOf
                                .replace('%i', formattedInvalidCount)
                                .replace('%f', formattedFixableCount)
                                .replace('%t', formattedTotalCount);


                            const li = document.createElement('li');
                            li.className = TARGET_LI_CLASS;

                            li.innerHTML = \`
                                <a href="\${safeCountryName}/\${safeDivisionName}.html" class="flex-grow flex items-center space-x-4">
                                    <div class="h-12 w-12 rounded-full flex-shrink-0" style="background-color: \${backgroundColor};"></div>
                                    <div class="flex-grow">
                                        <h3 class="text-xl font-bold text-gray-900">\${division.name}</h3>
                                        <p class="text-sm text-gray-500">\${itemStatsLine}</p>
                                    </div>
                                </a>
                                <div class="text-center sm:text-right">
                                    <p class="text-2xl font-bold text-gray-800">\${formattedPercentage}<span class="text-base font-normal">%</span></p>
                                    <p class="text-xs text-gray-500">\${T_CLIENT.invalid}</p>
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
                    li.className = 'p-6 text-center text-gray-500 rounded-xl';
                    // Use the translated fallback message
                    li.textContent = T_CLIENT.noSubdivisionsFound;
                    listContainer.appendChild(li);
                }
                updateButtonStyles();
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

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [countryName])}</title>
        ${favicon}
        <link href="./styles.css" rel="stylesheet">
        <style>
            body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-5xl mx-auto space-y-8">
            <header class="text-center space-y-2">
                <a href="index.html" class="inline-block mb-4 text-blue-500 hover:text-blue-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToAllCountries', locale)}</span>
                </a>
                <h1 class="text-4xl font-extrabold text-gray-900">${translate('osmPhoneNumberValidation', locale)}</h1>
                <p class="text-sm text-gray-500">${translate('reportSubtitleFor', locale, [countryName])}</p>
            </header>
            ${createStatsBox(totalTotalNumbers, totalInvalidCount, totalAutofixableCount, locale)}
            <div class="bg-white rounded-xl shadow-lg p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">${translate('divisionalReports', locale)}</h2>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-4 sm:mt-0">
                        <div class="flex items-center">
                            <input type="checkbox" id="hide-empty" checked class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300">
                            <label for="hide-empty" class="ml-2 text-sm font-medium text-gray-700">${translate('hideEmptyDivisions', locale)}</label>
                        </div>
                        <div class="flex flex-wrap items-center space-x-2">
                            <span class="mr-2 text-sm font-medium text-gray-700">${translate('sortBy', locale)}</span>
                            <button id="sort-percentage" data-sort="percentage" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">${translate('invalidPercentage', locale)}</button>
                            <button id="sort-invalid" data-sort="invalidCount" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">${translate('invalidCount', locale)}</button>
                            <button id="sort-name" data-sort="name" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">${translate('name', locale)}</button>
                        </div>
                    </div>
                </div>
                <div id="division-list" class="space-y-4">
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-lg p-2 text-center">
                ${createFooter(locale, translations)}
            </div>
        </div>
        ${renderListScript}
    </body>
    </html>
    `;
    pageFileName = path.join(PUBLIC_DIR, `${safeName(countryName)}.html`)
    fs.writeFileSync(pageFileName, htmlContent);
    console.log(`Report for ${countryName} generated at ${pageFileName}.`);
}

module.exports = {
    createStatsBox,
    createFooter,
    generateHtmlReport,
    generateMainIndexHtml,
    generateCountryIndexHtml,
};
