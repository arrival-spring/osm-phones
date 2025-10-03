const { translate } = require('./i18n');
const { ICON_ATTRIBUTION } = require('./constants.js')
const githubLink = "https://github.com/arrival-spring/osm-phones/";

/**
 * Phone number emoji as the favicon
 */
const favicon = '<link rel="icon" href="data:image/svg+xml,&lt;svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22&gt;&lt;text y=%22.9em%22 font-size=%2290%22&gt;📞&lt;/text&gt;&lt;/svg&gt;">';

const themeButton = `<button id="theme-toggle" type="button" class="theme-toggle-button">
                        <svg id="theme-toggle-dark-icon" class="hidden w-7 h-7" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                        <svg id="theme-toggle-light-icon" class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="5"/><line x1="12" y1="3" x2="12" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="19" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5.64" y1="5.64" x2="6.8" y2="6.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="17.2" y1="17.2" x2="18.36" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="5.64" y1="18.36" x2="6.8" y2="17.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="17.2" y1="6.8" x2="18.36" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>`;

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
        <div class="stats-box">
            <div>
                <p class="stats-box-number">${formattedTotal}</p>
                <p class="stats-box-label">${translate('numbersChecked', locale)}</p>
            </div>
            <div>
                <p class="stats-box-number-invalid">${formattedInvalid}</p>
                <p class="stats-box-label">${translate('invalidNumbers', locale)}</p>
                <p class="stats-box-percentage">${translate('invalidPercentageOfTotal', locale, [formattedTotalPercentage])}</p>
            </div>
            <div>
                <p class="stats-box-number-fixable">${formattedFixable}</p>
                <p class="stats-box-label">${translate('potentiallyFixable', locale)}</p>
                <p class="stats-box-percentage">${translate('fixablePercentageOfInvalid', locale, [formattedFixablePercentage])}</p>
            </div>
        </div>
    `;
}


function getIconAttributionHtml(includeIconAttribution) {
    return includeIconAttribution ? (
        ICON_ATTRIBUTION.map(iconPack => {

            // Part 1: Icon Name Link (or just the name if link is missing)
            const nameElement = (iconPack.name && iconPack.link)
                ? `<a href="${iconPack.link}" target="_blank" rel="noopener noreferrer" class="footer-link">${iconPack.name}</a>`
                : iconPack.name || '';

            // Part 2: Attribution Text
            const attributionElement = iconPack.attribution || '';

            // Part 3: License Link (or just the license if link is missing)
            const licenseElement = (iconPack.license && iconPack.license_link)
                ? `<a href="${iconPack.license_link}" target="_blank" rel="noopener noreferrer" class="footer-link">${iconPack.license}</a>`
                : iconPack.license || '';

            // Combine all non-empty parts with a space separator
            const combinedContent = [nameElement, attributionElement, licenseElement]
                .filter(Boolean) // Filters out any empty strings ('', 0, null, undefined)
                .join(' ');

            return `<p class="footer-text">${combinedContent}</p>`;
        }).join('\n') // Join all the generated <p> tags
    ) : '';
}


/**
 * Creates the HTML footer with data timestamp and GitHub link.
 * @param {string} locale - Locale to format the date in
 * @param {Object} translations - The translations dictionary for the current locale
 * @returns {string}
 */
function createFooter(locale = 'en-GB', translations, includeIconAttribution = false) {
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
       class="footer-text"
       data-timestamp="${dataTimestamp.getTime()}">
        ${dataSourcedTemplate}
    </p>
    <p class="footer-text">${suggestionIssueLink} <a href="${githubLink}" target="_blank" rel="noopener noreferrer" class="footer-link">${letMeKnowOnGitHub}</a>.</p>
    ${getIconAttributionHtml(includeIconAttribution)}
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

module.exports = {
    themeButton,
    favicon,
    createStatsBox,
    createFooter,
};