const { promises: fsPromises, readFileSync, existsSync } = require('fs');
const path = require('path');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE, ICONS_DIR } = require('./constants');
const { safeName, getFeatureTypeName, getFeatureIcon, isDisused } = require('./data-processor');
const { translate } = require('./i18n');
const { getDiffHtml } = require('./diff-renderer');
const { favicon, themeButton, createFooter, createStatsBox } = require('./html-utils')

function createDetailsGrid(item, locale) {
    const detailsGrid = Object.keys(item.invalidNumbers).map(key => {
        const originalNumber = item.invalidNumbers[key];
        const suggestedFix = item.suggestedFixes[key];

        let originalNumberHtml;
        let suggestedFixHtml = '';

        if (suggestedFix) {
            const { oldDiff, newDiff } = getDiffHtml(originalNumber, suggestedFix);
            originalNumberHtml = `<span>${oldDiff}</span>`;
            suggestedFixHtml = `
                <div class="list-item-phone-label-container">
                    <span class="list-item-phone-label">${translate('suggestedFix', locale)}</span>
                </div>
                <div class="list-item-phone-value-container">
                    <span>${newDiff}</span>
                </div>
            `;
        } else {
            originalNumberHtml = `<span>${originalNumber}</span>`;
        }

        // Return the HTML for one set of phone number details
        return `
            <div class="list-item-details-grid">
                <div class="list-item-phone-label-container">
                    <span class="list-item-phone-label">${key}</span>
                </div>
                <div class="list-item-phone-value-container">
                    ${originalNumberHtml}
                </div>
                ${suggestedFixHtml}
            </div>
        `;
    }).join('<hr class="phone-separator-line">');

    return detailsGrid;
}

function getSvgContent(iconPath) {
    let svgContent = readFileSync(iconPath, 'utf8');
    // Remove the XML declaration
    svgContent = svgContent.replace(/<\?xml[^>]*\?>/, '');
    // Remove comments
    svgContent = svgContent.replace(/<!--[\s\S]*?-->/g, '');
    // Remove DOCTYPE
    svgContent = svgContent.replace(/<!DOCTYPE[^>]*>/i, '');
    // Set width and height
    svgContent = svgContent.replace(/ width="[^"]*"/, ' width="100%"').replace(/ height="[^"]*"/, ' height="100%"');

    return svgContent;
}

/**
 * Generates the HTML string for a specified icon, supporting Font Awesome classes,
 * NPM-installed SVG packs (Maki, Temaki), and build-time downloaded SVG packs 
 * (Roentgen, iD_presets).
 *
 * The ultimate fallback is always the 'iD-icon-point' SVG.
 *
 * @param {string} iconName - The full icon name string (e.g., 'maki-restaurant' or 'roentgen-food_court').
 * @returns {string} The HTML string containing the icon (Font Awesome <i> or inline <svg>).
 */
function getIconHtml(iconName) {
    if (!iconName) {
        // Fallback case 1: If no iconName is provided, use the ultimate fallback
        return getIconHtml('iD-icon-point');
    }

    const parts = iconName.split('-');
    const library = parts[0];
    const icon = parts.slice(1).join('-');

    let iconHtml = '';

    // --- Font Awesome (Class-Based Icons) ---
    if (library === 'fas' || library === 'far' || library === 'fab' || library === 'fa') {
        const className = `${library} fa-${icon}`;
        iconHtml = `<span class="list-item-icon-container"><i class="icon ${className}"></i></span>`;
    } 

    // --- NPM-Installed SVG Packs (Maki, Temaki) ---
    else if (library === 'maki' || library === 'temaki') {
        const packageName = library === 'maki' ? '@mapbox/maki' : '@rapideditor/temaki';
        
        // Path resolves relative to node_modules/
        const iconPath = path.resolve(__dirname, '..', `node_modules/${packageName}/icons/${icon}.svg`);
        
        if (existsSync(iconPath)) {
            const svgContent = getSvgContent(iconPath);
            iconHtml = `<span class="icon-svg">${svgContent}</span>`;
        } else {
            console.log(`Icon not found: ${library}-${icon}`)
        }
    } 
    
    // --- Build-Time Downloaded SVG Packs (Roentgen, iD_presets) ---
    else if (library === 'roentgen' || library === 'iD') {
        const basePath = path.resolve(ICONS_DIR, library);
        const iconPath = path.join(basePath, `${icon}.svg`);

        if (existsSync(iconPath)) {
            const svgContent = getSvgContent(iconPath);
            iconHtml = `<span class="icon-svg">${svgContent}</span>`;
        } else {
            console.log(`Icon not found: ${library}-${icon}`)
        }
    }

    // --- Ultimate Fallback: iD-icon-point ---
    // If iconHtml is empty (meaning the requested icon was not found), 
    // and we haven't already tried the iD-icon-point fallback, call it recursively.
    if (!iconHtml && iconName !== 'iD-icon-point') {
        console.log(`No icon found for ${iconName}, using point fallback`)
        return getIconHtml('iD-icon-point');
    }

    // If iconHtml is still empty here, it means the iD-icon-point icon also couldn't be loaded (a major error).
    // In this critical scenario, we return a simple default placeholder.
    return iconHtml || `<span class="list-item-icon-container icon-fallback">?</span>`;
}


/**
 * Creates the HTML content for a single invalid number item.
 * @param {Object} item - The invalid number data item.
 * @param {string} locale - The locale for the text
 * @returns {string}
 */
function createListItem(item, locale) {

    const josmFixBaseUrl = 'http://127.0.0.1:8111/load_object';
    const josmEditUrl = `${josmFixBaseUrl}?objects=${item.type[0]}${item.id}`;

    // Construct JOSM fix URL including all fixable values, if the whole thing is fixable
    // if it is not fixable, no link is made or shown
    const fixes = Object.entries(item.suggestedFixes);

    const encodedTags = fixes.map(([key, value]) => {
        const encodedKey = encodeURIComponent(key);
        const encodedValue = encodeURIComponent(value);
        return `${encodedKey}=${encodedValue}`;
    });

    const addtagsValue = encodedTags.join('|');

    const josmFixUrl = item.autoFixable ?
        `${josmEditUrl}&addtags=${addtagsValue}` :
        null;

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
                class="btn btn-editor">
                ${text}
            </a>
        `;
    }).join('\n');

    // Generate JOSM Fix Button (special case)
    const josmFixButton = josmFixUrl ?
        `<a href="#" onclick="openInJosm('${josmFixUrl}', event)" 
            data-editor-id="josm-fix"
            class="btn btn-josm-fix">
            ${translate('fixInJOSM', locale)}
        </a>` :
        '';
    const fixableLabel = item.autoFixable ?
        `<span data-editor-id="fix-label" class="label label-fixable">${translate('fixable', locale)}</span>` :
        '';

    const websiteButton = item.website ?
        `<a href="${item.website}" class="btn btn-website" target="_blank">${translate('website', locale)}</a>` :
        '';
    const disusedLabel = isDisused(item) ? `<span class="label label-disused">${translate('disused', locale)}</span>` : '';

    const iconName = getFeatureIcon(item, locale);
    const iconHtml = getIconHtml(iconName);

    return `
        <li class="report-list-item">
            <div class="list-item-icon-circle-preview">
                ${iconHtml}
            </div>
            <div class="list-item-content-wrapper">
                <div class="list-item-header">
                    <h3 class="list-item-title">
                        <a href="${item.osmUrl}" target="_blank" rel="noopener noreferrer" class="list-item-link">${getFeatureTypeName(item, locale)}</a>
                    </h3>
                    ${disusedLabel}
                </div>
                ${createDetailsGrid(item, locale)}
            </div>
            
            <div class="list-item-actions-container">
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
        <div class="section-header-container">
            <h2 class="section-header">${translate('fixableNumbersHeader', locale)}</h2>
            <p class="section-description">${translate('fixableNumbersDescription', locale)}</p>
        </div>
        <ul class="report-list">
            ${fixableListContent}
        </ul>`;

    const invalidSectionAndHeader = `
        <div class="text-center">
            <h2 class="section-header">${translate('invalidNumbersHeader', locale)}</h2>
            <p class="section-description">${translate('invalidNumbersDescription', locale)}</p>
        </div>
        <ul class="report-list">
            ${invalidListContent}
        </ul>`;

    const noInvalidContent = `<li class="report-list-item-empty">${translate('noInvalidNumbers', locale)}</li>`;

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
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <script src="../theme.js"></script>
    </head>
    <body class="body-styles">
        <div class="page-container">
            <header class="page-header">
                <div class="absolute top-0 right-0 flex items-center space-x-2">
                    ${themeButton}
                    <button id="settings-toggle" class="settings-button" aria-label="${translate('settings', locale)}">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340.274 340.274" fill="currentColor" class="7 w-7">
                            <path d="M293.629,127.806l-5.795-13.739c19.846-44.856,18.53-46.189,14.676-50.08l-25.353-24.77l-2.516-2.12h-2.937 c-1.549,0-6.173,0-44.712,17.48l-14.184-5.719c-18.332-45.444-20.212-45.444-25.58-45.444h-35.765 c-5.362,0-7.446-0.006-24.448,45.606l-14.123,5.734C86.848,43.757,71.574,38.19,67.452,38.19l-3.381,0.105L36.801,65.032 c-4.138,3.891-5.582,5.263,15.402,49.425l-5.774,13.691C0,146.097,0,147.838,0,153.33v35.068c0,5.501,0,7.44,46.585,24.127 l5.773,13.667c-19.843,44.832-18.51,46.178-14.655,50.032l25.353,24.8l2.522,2.168h2.951c1.525,0,6.092,0,44.685-17.516 l14.159,5.758c18.335,45.438,20.218,45.427,25.598,45.427h35.771c5.47,0,7.41,0,24.463-45.589l14.195-5.74 c26.014,11,41.253,16.585,45.349,16.585l3.404-0.096l27.479-26.901c3.909-3.945,5.278-5.309-15.589-49.288l5.734-13.702 c46.496-17.967,46.496-19.853,46.496-25.221v-35.029C340.268,146.361,340.268,144.434,293.629,127.806z M170.128,228.474 c-32.798,0-59.504-26.187-59.504-58.364c0-32.153,26.707-58.315,59.504-58.315c32.78,0,59.43,26.168,59.43,58.315 C229.552,202.287,202.902,228.474,170.128,228.474z"/>
                        </svg>
                    </button>
                    <div id="editor-settings-menu" class="settings-menu hidden">
                        </div>
                </div>
                <a href="../${safeCountryName}.html" class="back-link">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToCountryPage', locale)}</span>
                </a>
                <h1 class="page-title">${translate('phoneNumberReport', locale)}</h1>
                <h2 class="page-subtitle">${subdivision.name}</h2>
            </header>
            ${createStatsBox(totalNumbers, invalidNumbers.length, autofixableNumbers.length, locale)}
            ${fixableAndInvalidSectionContent}
            <div class="footer-container">
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
                        <label for="editor-\${id}" class="text-sm text-gray-700 dark:text-gray-300 w-full text-right mr-2">\${id}</label>
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

module.exports = {
    generateHtmlReport,
};