const { promises: fsPromises, readFileSync, existsSync } = require('fs');
const path = require('path');
const { PUBLIC_DIR, OSM_EDITORS, ALL_EDITOR_IDS, DEFAULT_EDITORS_DESKTOP, DEFAULT_EDITORS_MOBILE, ICONS_DIR } = require('./constants');
const { safeName, getFeatureTypeName, getFeatureIcon, isDisused } = require('./data-processor');
const { translate } = require('./i18n');
const { getDiffHtml } = require('./diff-renderer');
const { favicon, themeButton, createFooter, createStatsBox, escapeHTML } = require('./html-utils')

// Global map to store unique icons that need to be in the SVG sprite
// Stores: { iconName: { content: <path/g data>, viewBox: '0 0 24 24' } }
const iconSvgData = new Map();

/**
 * Adds an icon's SVG content and viewBox to the global collection for sprite generation.
 * @param {string} iconName - The ID the icon will have in the sprite (e.g., 'maki-restaurant').
 * @param {string} svgContent - The cleaned SVG path/group content (inner XML).
 * @param {string} viewBox - The SVG's viewBox attribute value.
 */
function addIconToSprite(iconName, svgContent, viewBox) {
    if (!iconSvgData.has(iconName)) {
        iconSvgData.set(iconName, { content: svgContent, viewBox: viewBox });
    }
}

/**
 * Generates the complete SVG sprite content.
 * @returns {string} The HTML string for the hidden SVG sprite.
 */
function generateSvgSprite() {
    let symbols = '';
    
    // We set a default in case the viewBox is somehow missed
    const defaultViewBox = '0 0 24 24';

    for (const [iconName, data] of iconSvgData.entries()) {
        const viewBox = data.viewBox || defaultViewBox;
        
        // Wrap the inner SVG content in a <symbol> with the correct ID and viewBox
        symbols += `
            <symbol id="${iconName}" viewBox="${viewBox}">
                ${data.content}
            </symbol>
        `;
    }

    // Wrap all symbols in a hidden SVG container
    // We add 'display: none' to hide the entire sprite element
    return `
        <svg xmlns="http://www.w3.org/2000/svg" style="display: none;" aria-hidden="true" focusable="false">
            ${symbols}
        </svg>
    `;
}

/**
 * Creates the HTML grid for displaying an invalid phone number tag and its suggested fix.
 * It generates a diff view if a fix is available.
 * @param {Object} item - The invalid item object, containing `invalidNumbers` and `suggestedFixes`.
 * @param {string} locale - The current locale for translations.
 * @returns {string} The HTML string for the details grid.
 */
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
            originalNumberHtml = `<span>${escapeHTML(originalNumber)}</span>`;
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

/**
 * Reads an SVG file, cleans it, extracts the viewBox, and returns the inner content.
 * @param {string} iconPath - The full path to the SVG file.
 * @returns {{content: string, viewBox: string}} An object with the inner content and the viewBox string.
 */
function getSvgContent(iconPath) {
    let svgContent = readFileSync(iconPath, 'utf8');
    
    // 1. Extract viewBox before removing the outer tag
    const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/i);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24'; // Default fallback

    // 2. Remove non-essential parts
    // Remove the outer <svg> tag and its closing tag
    svgContent = svgContent.replace(/<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    
    // Remove XML declaration
    svgContent = svgContent.replace(/<\?xml[^>]*\?>/, '');
    // Remove comments
    svgContent = svgContent.replace(/<!--[\s\S]*?-->/g, '');
    // Remove DOCTYPE
    svgContent = svgContent.replace(/<!DOCTYPE[^>]*>/i, '');

    // 3. Return the data needed for the sprite
    return {
        content: svgContent.trim(),
        viewBox: viewBox
    };
}

/**
 * Generates the HTML string for a specified icon, supporting Font Awesome classes,
 * and collects SVGs for the sprite.
 *
 * @param {string} iconName - The full icon name string (e.g., 'maki-restaurant' or 'roentgen-food_court').
 * @returns {string} The HTML string containing the icon (Font Awesome <i> or <svg><use>).
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
        iconHtml = `<i class="icon ${className}"></i>`;
    }

    // --- SVG Packs (Maki, Temaki, Roentgen, iD_presets) ---
    else if (library === 'maki' || library === 'temaki' || library === 'roentgen' || library === 'iD') {
        let iconPath = '';
        let packageName = '';
        let isFound = false;

        // Determine icon path (logic remains the same)
        if (library === 'maki' || library === 'temaki') {
            packageName = library === 'maki' ? '@mapbox/maki' : '@rapideditor/temaki';
            iconPath = path.resolve(__dirname, '..', `node_modules/${packageName}/icons/${icon}.svg`);
        } else {
            const basePath = path.resolve(ICONS_DIR, library);
            iconPath = path.join(basePath, `${icon}.svg`);
        }

        if (existsSync(iconPath)) {
            // Get the inner content and viewBox
            const { content, viewBox } = getSvgContent(iconPath);
            
            // 1. Collect the icon for the sprite
            addIconToSprite(iconName, content, viewBox);
            isFound = true;

            // 2. Return the minimal <svg> with <use> tag
            // The class 'icon-svg' will be used to apply size/styles to the outer SVG container.
            // Using `<svg><use>` is the standard for sprite usage.
            iconHtml = `
                <span class="icon-svg-container">
                    <svg class="icon-svg"><use href="#${iconName}"></use></svg>
                </span>
            `;
        } else {
            console.log(`Icon not found: ${library}-${icon}`)
        }
    }

    // --- Ultimate Fallback: iD-icon-point ---
    if (!iconHtml && iconName !== 'iD-icon-point') {
        console.log(`No icon found for ${iconName}, using point fallback`)
        // The recursive call handles adding the fallback icon to the sprite
        return getIconHtml('iD-icon-point');
    }

    // Return the HTML with <use> or Font Awesome <i>, or the critical fallback
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

    const addtagsValue = encodedTags.join('%7C');

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
            <div class="list-item-content-wrapper">
                <a class="list-item-icon-circle-preview" href="${item.osmUrl}" target="_blank" rel="noopener noreferrer">
                    ${iconHtml}
                </a>
                <div class="list-item-details-wrapper">
                    <div class="list-item-header">
                        <h3 class="list-item-title">${escapeHTML(getFeatureTypeName(item, locale))}</h3>
                        ${disusedLabel}
                    </div>
                    ${createDetailsGrid(item, locale)}
                </div>
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
 * @param {Object} subdivisionStats - The subdivision statistics object.
 * @param {Array<Object>} invalidNumbers - List of invalid items.
 * @param {string} locale
 * @param {Object} translations
 */
async function generateHtmlReport(countryName, subdivisionStats, invalidNumbers, locale, translations) {

    // Clear the map at the start of report generation for a new page.
    iconSvgData.clear(); 

    const subdivisionSlug = path.join(subdivisionStats.divisionSlug, subdivisionStats.slug);
    const safeCountryName = safeName(countryName);
    const filePath = path.join(PUBLIC_DIR, safeCountryName, `${subdivisionSlug}.html`);

    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);
    const manualFixNumbers = invalidNumbers.filter(item => !item.autoFixable);

    const anyInvalid = manualFixNumbers.length > 0
    const anyFixable = autofixableNumbers.length > 0

    const fixableListContent = autofixableNumbers.map(item => createListItem(item, locale)).join('');
    const invalidListContent = manualFixNumbers.map(item => createListItem(item, locale)).join('');

    // Generate the sprite after all list items have been processed
    const svgSprite = generateSvgSprite();

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
        <link href="../../styles.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <script src="../../theme.js"></script>
    </head>
    <body class="body-styles">
        ${svgSprite}
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
                <a href="../" class="back-link">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">${translate('backToCountryPage', locale)}</span>
                </a>
                <h1 class="page-title">${translate('phoneNumberReport', locale)}</h1>
                <h2 class="page-subtitle">${escapeHTML(subdivisionStats.name)}</h2>
            </header>
            ${createStatsBox(subdivisionStats.totalNumbers, invalidNumbers.length, autofixableNumbers.length, locale)}
            ${fixableAndInvalidSectionContent}
            <div class="footer-container">
                ${createFooter(locale, translations, true)}
            </div>
        </div>
    <script>
        /**
         * Sends a command to the JOSM Remote Control API.
         * Prevents the default link action and provides user feedback in the console.
         * @param {string} url - The JOSM Remote Control URL to fetch.
         * @param {Event} event - The click event, to prevent its default action.
         */
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

        /**
         * Checks if the current viewport width corresponds to a mobile device.
         * @returns {boolean} True if the viewport is likely a mobile device.
         */
        function isMobileView() {
            // This checks if the viewport width is less than a common tablet/desktop breakpoint (e.g., 768px for Tailwind's 'md')
            return window.matchMedia("(max-width: 767px)").matches;
        }

        const DEFAULT_EDITORS = isMobileView() ? DEFAULT_EDITORS_MOBILE : DEFAULT_EDITORS_DESKTOP;
        
        const settingsToggle = document.getElementById('settings-toggle');
        const settingsMenu = document.getElementById('editor-settings-menu');
        
        let currentActiveEditors = [];

        // Storage & Utility Functions
        
        /**
         * Loads the user's preferred editor settings from localStorage.
         * If no settings are found, it falls back to the default editors.
         */
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

        /**
         * Saves the current editor visibility settings to localStorage.
         */
        function saveSettings() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(currentActiveEditors));
            } catch (e) {
                console.error("Error saving settings to localStorage:", e);
            }
        }

        // 2. UI Rendering and Event Handlers

        /**
         * Renders the editor selection checkboxes inside the settings menu
         * based on the list of all available editors.
         */
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

        /**
         * Handles the change event for editor visibility checkboxes.
         * Updates the \`currentActiveEditors\` array and saves the settings.
         * @param {Event} event - The change event from the checkbox.
         */
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

        /**
         * Shows or hides editor buttons on the page based on the user's
         * current visibility settings in \`currentActiveEditors\`.
         */
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
    console.log(`Generated report for ${subdivisionStats.name} at ${filePath}`);
}

module.exports = {
    generateHtmlReport,
};