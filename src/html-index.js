const { promises: fsPromises } = require('fs');
const path = require('path');
const { PUBLIC_DIR } = require('./constants');
const { translate } = require('./i18n');
const {favicon, themeButton, createFooter} = require('./html-utils')

/**
 * Generates the main index.html file listing all country reports.
 * @param {Array<Object>} countryStats - Array of country statistic objects, including country.locale.
 * @param {string} locale - The primary locale for the main page structure (e.g., 'en').
 * @param {Object} translations
 */
async function generateMainIndexHtml(countryStats, locale, translations) {

    const listContent = countryStats.map(country => {
        const safeCountryName = country.slug;
        const countryPageName = `/${safeCountryName}/`;
        const percentage = country.totalNumbers > 0 ? (country.invalidCount / country.totalNumbers) * 100 : 0;
        const invalidPercentage = Math.max(0, Math.min(100, percentage));

        // Use the country's specific locale for number formatting and description text
        const itemLocale = country.locale || locale; // Fallback to the main page locale

        // Format numbers using the *country's* specific locale
        const formattedInvalid = country.invalidCount.toLocaleString(itemLocale);
        const formattedFixable = country.autoFixableCount.toLocaleString(itemLocale);
        const formattedTotal = country.totalNumbers.toLocaleString(itemLocale);

        // Use the country's specific locale for the description translation
        const description = translate('invalidNumbersOutOf', itemLocale, [formattedInvalid, formattedFixable, formattedTotal]);

        return `
            <a href="${countryPageName}" class="country-link">
                <div class="country-link-content">
                    <div class="color-indicator" data-percentage="${invalidPercentage}"></div>
                    <div class="country-link-text-container">
                        <h3 class="country-name">${country.name}</h3>
                        <p class="country-description">${description}</p>
                    </div>
                </div>
                <div class="country-stats-container">
                    <p class="country-percentage">${invalidPercentage.toLocaleString(itemLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span class="country-percentage-symbol">%</span></p>
                    <p class="country-invalid-label">${translate('invalid', itemLocale)}</p>
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
    </head>
    <body class="body-styles">
        <div class="page-container">
            <header class="page-header">
                <div class="flex flex-col">
                    <div class="items-end>
                        ${themeButton}
                    </div>
                    <h1 class="page-title">${translate('osmPhoneNumberValidation', locale)}</h1>
                </div>
                <p class="report-subtitle">${translate('reportSubtitle', locale)}</p>
            </header>
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">${translate('countryReports', locale)}</h2>
                </div>
                <div class="space-y-4">
                    ${listContent}
                </div>
            </div>
            <div class="footer-container">
                ${createFooter(locale, translations)}
            </div>
        </div>
        <script src="./backgroundColor.js"></script>
    </body>
    </html>
    `;
    await fsPromises.writeFile(path.join(PUBLIC_DIR, 'index.html'), htmlContent);
    console.log('Main index.html generated.');
}

module.exports = {
    generateMainIndexHtml,
};