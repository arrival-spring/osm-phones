const { promises: fsPromises } = require('fs');
const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE } = require('./constants');
const { safeName, getFeatureTypeName, isDisused } = require('./data-processor');
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
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
                <p class="text-4xl font-extrabold text-gray-800 dark:text-gray-100">${formattedTotal}</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">${translate('numbersChecked', locale)}</p>
            </div>
            <div>
                <p class="text-4xl font-extrabold text-blue-700 dark:text-blue-400">${formattedInvalid}</p>
                <p class="text-gray-500 dark:text-gray-400">${translate('invalidNumbers', locale)}</p>
                <p class="text-sm text-gray-400 dark:text-gray-500">${translate('invalidPercentageOfTotal', locale, [formattedTotalPercentage])}</p>
            </div>
            <div>
                <p class="text-4xl font-extrabold text-green-700 dark:text-green-400">${formattedFixable}</p>
                <p class="text-gray-500 dark:text-gray-400">${translate('potentiallyFixable', locale)}</p>
                <p class="text-sm text-gray-400 dark:text-gray-500">${translate('fixablePercentageOfInvalid', locale, [formattedFixablePercentage])}</p>
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
    const dataSourcedTemplate = translate('dataSourcedTemplate', locale, [formattedDate, formattedTime, 'UTC', translate('timeAgoJustNow', locale)]);
    const suggestionIssueLink = translate('suggestionIssueLink', locale);
    const letMeKnowOnGitHub = translate('letMeKnowOnGitHub', locale);

    return `
    <p id="data-timestamp-container" 
       class="text-sm text-gray-500 dark:text-gray-400 mt-2"
       data-timestamp="${dataTimestamp.getTime()}">
        ${dataSourcedTemplate}
    </p>
    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">${suggestionIssueLink} <a href="${githubLink}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 underline transition-colors">${letMeKnowOnGitHub}</a>.</p>
    
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

    const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
    const fixedNumber = item.suggestedFixes.join('; ');
    const josmEditUrl = `${josmFixBaseUrl}?objects=${item.type[0]}${item.id}`;
    const josmFixUrl = item.autoFixable ?
        `${josmEditUrl}&addtags=${item.tag}=${encodeURIComponent(fixedNumber)}` :
        null;
    const commonButtonClass = 'inline-flex items-center rounded-full px-3 py-1.5 shadow-sm transition-colors';
    const commonLabelClass = 'text-xs font-semibold inline-flex items-center px-2 py-1 rounded-full';

    // Generate buttons for ALL editors so client-side script can hide them
    const editorButtons = ALL_EDITOR_IDS.map(editorId => {
        const editor = OSM_EDITORS[editorId];
        if (!editor) return '';

        const url = editor.getEditLink(item);
        const text = editor.editInString(locale);
        const isJosm = editorId === 'JOSM';

        // Use a standard target="_blank" for non-JOSM/non-GEO links
        const target = isJosm ? '' : (editorId === 'Geo' ? '' : 'target="_blank"');

        // JOSM requires an onclick handler; others use a direct href
        const href = isJosm ? '#' : url;
        const onClick = isJosm ? `onclick="openInJosm('${url}', event)"` : '';

        return `
            <a href="${href}" ${target} ${onClick} 
                data-editor-id="${editorId}"
                class="${commonButtonClass} bg-blue-500 hover:bg-blue-600 text-white">
                ${text}
            </a>
        `;
    }).join('\n');

    // Generate JOSM Fix Button (special case)
    const josmFixButton = josmFixUrl ?
        `<a href="#" onclick="openInJosm('${josmFixUrl}', event)" 
            data-editor-id="josm-fix"
            class="${commonButtonClass} bg-yellow-200 text-yellow-800 hover:bg-yellow-300">
            ${translate('fixInJOSM', locale)}
        </a>` :
        '';
    const fixableLabel = item.autoFixable ?
        `<span data-editor-id="fix-label" class="${commonLabelClass} bg-yellow-200 text-yellow-800">${translate('fixable', locale)}</span>` :
        '';

    const phoneNumber = item.invalidNumbers;
    const websiteButton = item.website ?
        `<a href="${item.website}" class="${commonButtonClass} bg-green-500 text-white hover:bg-green-600" target="_blank">${translate('website', locale)}</a>` :
        '';
    const disusedLabel = isDisused(item) ? `<span class="${commonLabelClass} bg-red-200 text-red-800">${translate('disused', locale)}</span>` : '';

    return `
        <li class="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <div class="w-full sm:w-2/3">
                <div class="flex-shrink-0 flex flex-wrap items-center gap-2">
                    <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
                        <a href="${item.osmUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-gray-950 dark:hover:text-gray-200 underline transition-colors">${getFeatureTypeName(item)}</a>
                    </h3>
                    ${disusedLabel}
                </div>
                <div class="grid grid-cols-[max-content,1fr] gap-x-4">
                    <div class="col-span-1">
                        <span class="font-semibold text-xs text-gray-700 dark:text-gray-400">${translate('phone', locale)}</span>
                    </div>
                    <div class="col-span-1">
                        <span>${phoneNumber}</span>
                    </div>
                    ${item.autoFixable ? `
                    <div class="col-span-1">
                        <span class="font-semibold text-xs text-gray-700">${translate('suggestedFix', locale)}</span>
                    </div>
                    <div class="col-span-1">
                        <span>${fixedNumber}</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            <div class="flex flex-wrap gap-2 w-full sm:w-2/3 justify-end text-sm font-semibold">
                ${websiteButton}
                ${fixableLabel}
                ${josmFixButton}
                ${editorButtons} 
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

    const anyInvalid = manualFixNumbers.length > 0
    const anyFixable = autofixableNumbers.length > 0

    const fixableListContent = autofixableNumbers.map(item => createListItem(item, locale)).join('');
    const invalidListContent = manualFixNumbers.map(item => createListItem(item, locale)).join('');

    const fixableSectionAndHeader = `
        <div class="text-center">
            <h2 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">${translate('fixableNumbersHeader', locale)}</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">${translate('fixableNumbersDescription', locale)}</p>
        </div>
        <ul class="space-y-4">
            ${fixableListContent}
        </ul>`;

    const invalidSectionAndHeader = `
        <div class="text-center">
            <h2 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">${translate('invalidNumbersHeader', locale)}</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">${translate('invalidNumbersDescription', locale)}</p>
        </div>
        <ul class="space-y-4">
            ${invalidListContent}
        </ul>`;

    const noInvalidContent = `<li class="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 text-center text-gray-500 dark:text-gray-400">${translate('noInvalidNumbers', locale)}</li>`;

    const fixableAndInvalidSectionContent =
        (anyFixable && anyInvalid) ? fixableSectionAndHeader + invalidSectionAndHeader :
        anyFixable ? fixableSectionAndHeader :
        anyInvalid ? invalidSectionAndHeader :
        noInvalidContent

    // Dynamically create the list of all editor IDs for the client-side script
    const allEditorIdsClient = JSON.stringify(ALL_EDITOR_IDS);

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [countryName])}</title>
        ${favicon}
        <link href="../styles.css" rel="stylesheet">
        <script src="../theme.js"></script>
        <style>
            body { font-family: 'Inter', sans-serif; @apply bg-gray-100 dark:bg-gray-900; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-4xl mx-auto space-y-8">
            <header class="text-center relative"> 
                <div class="absolute top-0 right-0 flex items-center space-x-2">
                    <button id="theme-toggle" type="button" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5">
                        <svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                        <svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-3.536a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3.05 4.54a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zm1.414 10.606l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 011.414-1.414zM16.95 4.54a1 1 0 010 1.414l.707.707a1 1 0 111.414-1.414l-.707-.707a1 1 0 01-1.414 0z"></path></svg>
                    </button>
                    <button id="settings-toggle" class="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors rounded-full" aria-label="${translate('settings', locale)}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340.274 340.274" fill="currentColor" class="h-6 w-6">
                            <path d="M293.629,127.806l-5.795-13.739c19.846-44.856,18.53-46.189,14.676-50.08l-25.353-24.77l-2.516-2.12h-2.937 c-1.549,0-6.173,0-44.712,17.48l-14.184-5.719c-18.332-45.444-20.212-45.444-25.58-45.444h-35.765 c-5.362,0-7.446-0.006-24.448,45.606l-14.123,5.734C86.848,43.757,71.574,38.19,67.452,38.19l-3.381,0.105L36.801,65.032 c-4.138,3.891-5.582,5.263,15.402,49.425l-5.774,13.691C0,146.097,0,147.838,0,153.33v35.068c0,5.501,0,7.44,46.585,24.127 l5.773,13.667c-19.843,44.832-18.51,46.178-14.655,50.032l25.353,24.8l2.522,2.168h2.951c1.525,0,6.092,0,44.685-17.516 l14.159,5.758c18.335,45.438,20.218,45.427,25.598,45.427h35.771c5.47,0,7.41,0,24.463-45.589l14.195-5.74 c26.014,11,41.253,16.585,45.349,16.585l3.404-0.096l27.479-26.901c3.909-3.945,5.278-5.309-15.589-49.288l5.734-13.702 c46.496-17.967,46.496-19.853,46.496-25.221v-35.029C340.268,146.361,340.268,144.434,293.629,127.806z M170.128,228.474 c-32.798,0-59.504-26.187-59.504-58.364c0-32.153,26.707-58.315,59.504-58.315c32.78,0,59.43,26.168,59.43,58.315 C229.552,202.287,202.902,228.474,170.128,228.474z"/>
                        </svg>
                    </button>
                    <div id="editor-settings-menu" class="hidden absolute right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl z-10 text-left border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
                        </div>
                </div>
                <a href="../${safeCountryName}.html" class="inline-block mb-4 text-blue-500 hover:text-blue-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToCountryPage', locale)}</span>
                </a>
                <h1 class="text-4xl font-extrabold text-gray-900 dark:text-gray-100">${translate('phoneNumberReport', locale)}</h1>
                <h2 class="text-2xl font-semibold text-gray-700 dark:text-gray-300 mt-2">${subdivision.name}</h2>
            </header>
            ${createStatsBox(totalNumbers, invalidNumbers.length, autofixableNumbers.length, locale)}
            ${fixableAndInvalidSectionContent}
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-2 text-center">
                ${createFooter(locale, translations)}
            </div>
        </div>
    <script>
        function openInJosm(url, event) {
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
        
        // ----------------------------------------------------------------------------------------------------------------------
        // CLIENT-SIDE LOGIC FOR EDITOR SETTINGS
        // ----------------------------------------------------------------------------------------------------------------------

        const ALL_EDITOR_IDS = ${allEditorIdsClient};
        const DEFAULT_EDITORS_DESKTOP = ${JSON.stringify(DEFAULT_EDITORS_DESKTOP)};
        const DEFAULT_EDITORS_MOBILE = ${JSON.stringify(DEFAULT_EDITORS_MOBILE)};
        const STORAGE_KEY = 'osm_report_editors';

        function isMobileView() {
            // This checks if the viewport width is less than a common tablet/desktop breakpoint (e.g., 768px for Tailwind's 'md')
            return window.matchMedia("(max-width: 767px)").matches;
        }

        const DEFAULT_EDITORS = isMobileView() ? DEFAULT_EDITORS_MOBILE : DEFAULT_EDITORS_DESKTOP;
        
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsMenu = document.getElementById('editor-settings-menu');
        
        let currentActiveEditors = [];

        // Storage & Utility Functions
        
        function loadSettings() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    currentActiveEditors = JSON.parse(saved);
                    return;
                }
            } catch (e) {
                console.error("Error loading settings from localStorage:", e);
            }
            // Fallback to defaults
            currentActiveEditors = [...DEFAULT_EDITORS]; 
        }

        function saveSettings() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentActiveEditors));
            } catch (e) {
                console.error("Error saving settings to localStorage:", e);
            }
        }

        // 2. UI Rendering and Event Handlers

        function createSettingsCheckboxes() {
            settingsMenu.innerHTML = ''; 

            ALL_EDITOR_IDS.forEach(id => {
                const isChecked = currentActiveEditors.includes(id);
                const checkboxHtml = \`
                    <div class="flex items-center justify-between py-5 px-5">
                        <label for="editor-\${id}" class="text-sm text-gray-700 w-full text-right mr-2">\${id}</label>
                        <input id="editor-\${id}" type="checkbox" data-editor-id="\${id}" \${isChecked ? 'checked' : ''}
                            class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0">
                    </div>
                \`;
                settingsMenu.insertAdjacentHTML('beforeend', checkboxHtml);
            });

            settingsMenu.addEventListener('change', handleEditorChange);
        }

        function handleEditorChange(event) {
            const checkbox = event.target;
            if (checkbox.type === 'checkbox') {
                const editorId = checkbox.dataset.editorId;
                
                if (checkbox.checked) {
                    if (!currentActiveEditors.includes(editorId)) {
                        currentActiveEditors.push(editorId);
                    }
                } else {
                    currentActiveEditors = currentActiveEditors.filter(id => id !== editorId);
                }
                
                saveSettings();
                applyEditorVisibility();
            }
        }
        
        // 3. Visibility Application

        function applyEditorVisibility() {
            // Find all editor buttons using the data-editor-id attribute
            const buttons = document.querySelectorAll(':not(input)[data-editor-id]');
            
            buttons.forEach(button => {
                const editorId = button.dataset.editorId;
                
                // Special handling for the JOSM Fix button: always visible if JOSM is active
                // Display fix label if fix button is invisible
                if (editorId === 'josm-fix') {
                    const isVisible = currentActiveEditors.includes('JOSM');
                    button.style.display = isVisible ? 'inline-flex' : 'none';
                    return;
                }
                if (editorId === 'fix-label') {
                    const isVisible = !currentActiveEditors.includes('JOSM');
                    button.style.display = isVisible ? 'inline-flex' : 'none';
                    return;
                }
                
                const isVisible = currentActiveEditors.includes(editorId);
                button.style.display = isVisible ? 'inline-flex' : 'none';
            });
        }

        // 4. Initialization
        
        document.addEventListener('DOMContentLoaded', () => {
            loadSettings();
            createSettingsCheckboxes();
            applyEditorVisibility();

            settingsToggle.addEventListener('click', (event) => {
                settingsMenu.classList.toggle('hidden');
                event.stopPropagation(); // Stop click from propagating to document listener
            });
            
            // Close the menu if user clicks outside
            document.addEventListener('click', (event) => {
                if (!settingsMenu.contains(event.target) && !settingsToggle.contains(event.target)) {
                    settingsMenu.classList.add('hidden');
                }
            });
        });

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
async function generateMainIndexHtml(countryStats, locale, translations) {

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
            <a href="${countryPageName}" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 transition-transform transform hover:scale-105">
                <div class="flex-grow flex items-center space-x-4">
                    <div class="h-12 w-12 rounded-full flex-shrink-0" style="background-color: ${backgroundColor};"></div>
                    <div class="flex-grow">
                        <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100">${country.name}</h3>
                        <p class="text-sm text-gray-500 dark:text-gray-400">${description}</p>
                    </div>
                </div>
                <div class="text-center sm:text-right">
                    <p class="text-2xl font-bold text-gray-800 dark:text-gray-100">${validPercentage.toLocaleString(itemLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span class="text-base font-normal">%</span></p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">${translate('invalid', itemLocale)}</p>
                </div>
            </a>
        `;
    }).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('mainIndexTitle', locale)}</title>
        ${favicon}
        <link href="./styles.css" rel="stylesheet">
        <script src="theme.js"></script>
        <style>
            body { font-family: 'Inter', sans-serif; @apply bg-gray-100 dark:bg-gray-900; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-5xl mx-auto space-y-8">
            <header class="text-center space-y-2 relative">
                <div class="absolute top-0 right-0">
                    <button id="theme-toggle" type="button" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5">
                        <svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                        <svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-3.536a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3.05 4.54a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zm1.414 10.606l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 011.414-1.414zM16.95 4.54a1 1 0 010 1.414l.707.707a1 1 0 111.414-1.414l-.707-.707a1 1 0 01-1.414 0z"></path></svg>
                    </button>
                </div>
                <h1 class="text-4xl font-extrabold text-gray-900 dark:text-gray-100">${translate('osmPhoneNumberValidation', locale)}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">${translate('reportSubtitle', locale)}</p>
            </header>
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">${translate('countryReports', locale)}</h2>
                </div>
                <div class="space-y-4">
                    ${listContent}
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-2 text-center">
                ${createFooter(locale, translations)}
            </div>
        </div>
    </body>
    </html>
    `;
    await fsPromises.writeFile(path.join(PUBLIC_DIR, 'index.html'), htmlContent);
    console.log('Main index.html generated.');
}

/**
 * Creates the renderListScript for the country index page.
 * @param {string} countryName
 * @param {Object} groupedDivisionStats
 * @param {string} locale
 * @returns {string}
 */
function createRenderListScript(countryName, groupedDivisionStats, locale) {
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

    return `
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
async function generateCountryIndexHtml(countryName, groupedDivisionStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers, locale, translations) {
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="${locale}" class="">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${translate('countryReportTitle', locale, [countryName])}</title>
        ${favicon}
        <link href="./styles.css" rel="stylesheet">
        <script src="theme.js"></script>
        <style>
            body { font-family: 'Inter', sans-serif; @apply bg-gray-100 dark:bg-gray-900; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-5xl mx-auto space-y-8">
            <header class="text-center space-y-2 relative">
                <div class="absolute top-0 right-0">
                    <button id="theme-toggle" type="button" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5">
                        <svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                        <svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-3.536a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3.05 4.54a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zm1.414 10.606l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 011.414-1.414zM16.95 4.54a1 1 0 010 1.414l.707.707a1 1 0 111.414-1.414l-.707-.707a1 1 0 01-1.414 0z"></path></svg>
                    </button>
                </div>
                <a href="index.html" class="inline-block mb-4 text-blue-500 hover:text-blue-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToAllCountries', locale)}</span>
                </a>
                <h1 class="text-4xl font-extrabold text-gray-900 dark:text-gray-100">${translate('osmPhoneNumberValidation', locale)}</h1>
                <p class="text-sm text-gray-500 dark:text-gray-400">${translate('reportSubtitle', locale, [countryName])}</p>
            </header>
            ${createStatsBox(totalTotalNumbers, totalInvalidCount, totalAutofixableCount, locale)}
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-gray-100">${translate('divisionalReports', locale)}</h2>
                    <div class="flex flex-col sm:flex-row items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mt-4 sm:mt-0">
                        <div class="flex items-center">
                            <input type="checkbox" id="hide-empty" checked class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300">
                            <label for="hide-empty" class="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">${translate('hideEmptyDivisions', locale)}</label>
                        </div>
                        <div class="flex flex-wrap items-center justify-end space-x-2 space-y-2">
                            <span class="mr-2 text-sm font-medium text-gray-700 dark:text-gray-300">${translate('sortBy', locale)}</span>
                            <button id="sort-percentage" data-sort="percentage" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">${translate('invalidPercentage', locale)}</button>
                            <button id="sort-invalid" data-sort="invalidCount" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">${translate('invalidCount', locale)}</button>
                            <button id="sort-name" data-sort="name" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">${translate('name', locale)}</button>
                        </div>
                    </div>
                </div>
                <div id="division-list" class="space-y-4">
                </div>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-2 text-center">
                ${createFooter(locale, translations)}
            </div>
        </div>
        ${createRenderListScript(countryName, groupedDivisionStats, locale)}
    </body>
    </html>
    `;
    pageFileName = path.join(PUBLIC_DIR, `${safeName(countryName)}.html`)
    await fsPromises.writeFile(pageFileName, htmlContent);
    console.log(`Report for ${countryName} generated at ${pageFileName}.`);
}

module.exports = {
    createStatsBox,
    createFooter,
    generateHtmlReport,
    generateMainIndexHtml,
    generateCountryIndexHtml,
};
