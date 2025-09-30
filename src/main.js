const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, COUNTRIES } = require('./constants');
const { fetchAdminLevels, fetchOsmDataForDivision } = require('./osm-api');
const { safeName, validateNumbers } = require('./data-processor');
const {
    generateHtmlReport,
    generateMainIndexHtml,
    generateCountryIndexHtml
} = require('./html-utils');
const { getTranslations } = require('./i18n');

const CLIENT_KEYS = [
    'timeAgoJustNow',
    'timeAgoMinute',
    'timeAgoMinutesPlural',
    'timeAgoHour',
    'timeAgoHoursPlural',
    'timeAgoError',
    'dataSourcedTemplate'
];

const BUILD_TYPE = process.env.BUILD_TYPE;
const testMode = BUILD_TYPE === 'simplified';

/**
 * Filters the full translations object to include only keys needed by the client.
 * @param {Object} fullTranslations - The complete dictionary for a locale.
 * @returns {Object} A lightweight dictionary containing only client-side keys.
 */
function filterClientTranslations(fullTranslations) {
    const clientTranslations = {};
    for (const key of CLIENT_KEYS) {
        // Only include the key if it exists in the source dictionary
        if (fullTranslations[key] !== undefined) {
            clientTranslations[key] = fullTranslations[key];
        }
    }
    return clientTranslations;
}

async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR);
    }

    fs.copyFileSync(path.join(__dirname, 'theme.js'), path.join(PUBLIC_DIR, 'theme.js'));

    console.log('Starting full build process...');

    const countryStats = [];

    const defaultLocale = 'en-GB';
    const fullDefaultTranslations = getTranslations(defaultLocale);
    const clientDefaultTranslations = filterClientTranslations(fullDefaultTranslations);

    for (const countryKey in COUNTRIES) {
        const countryData = COUNTRIES[countryKey];
        const countryName = countryData.name;
        const locale = countryData.locale;

        const fullTranslations = getTranslations(locale);
        const clientTranslations = filterClientTranslations(fullTranslations);

        console.log(`Starting fetching divisions for ${countryName}...`);

        const countryDir = path.join(PUBLIC_DIR, safeName(countryName));
        if (!fs.existsSync(countryDir)) {
            fs.mkdirSync(countryDir, { recursive: true });
        }

        let totalInvalidCount = 0;
        let totalAutofixableCount = 0;
        let totalTotalNumbers = 0;
        const groupedDivisionStats = {};

        const divisions = countryData.divisions ?? countryData.divisionMap;

        let divisionCount = 0; 
        for (const divisionName in divisions) {
            console.log(`Processing subdivisions for ${divisionName}...`);

            const subdivisions = await (async () => {
                if (countryData.divisions) {
                    const divisionId = countryData.divisions[divisionName];
                    return await fetchAdminLevels(divisionId, divisionName, countryData.subdivisionAdminLevel);
                } else if (countryData.divisionMap) {
                    return countryData.divisionMap[divisionName]
                } else {
                    console.error(`Data for ${countryName} set up incorreectly, no divisions or divisionMap found`)
                    return null
                }
            })();

            groupedDivisionStats[divisionName] = [];

            console.log(`Processing phone numbers for ${subdivisions.length} subdivisions in ${divisionName}.`);

            let subdivisionCount = 0;
            for (const subdivision of subdivisions) {

                const elements = await fetchOsmDataForDivision(subdivision);
                const { invalidNumbers, totalNumbers } = validateNumbers(elements, countryData.countryCode);

                const autoFixableCount = invalidNumbers.filter(item => item.autoFixable).length;

                const stats = {
                    name: subdivision.name,
                    invalidCount: invalidNumbers.length,
                    autoFixableCount: autoFixableCount,
                    totalNumbers: totalNumbers
                };

                groupedDivisionStats[divisionName].push(stats);

                totalInvalidCount += invalidNumbers.length;
                totalAutofixableCount += autoFixableCount;
                totalTotalNumbers += totalNumbers;

                await generateHtmlReport(countryName, subdivision, invalidNumbers, totalNumbers, locale, clientTranslations);

                // Do one subdivision for one division in one country in test mode
                // count is here in case of needing to change it to test something
                subdivisionCount++;
                if (testMode && subdivisionCount >= 1) {
                    break;
                }
            }
            divisionCount++;
            if (testMode && divisionCount >= 1) {
                break;
            }
        }

        countryStats.push({
            name: countryName,
            locale: countryData.locale,
            invalidCount: totalInvalidCount,
            autoFixableCount: totalAutofixableCount,
            totalNumbers: totalTotalNumbers
        });

        await generateCountryIndexHtml(countryName, groupedDivisionStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers, locale, clientTranslations);

        if (testMode) {
            break;
        }
    }

    await generateMainIndexHtml(countryStats, defaultLocale, clientDefaultTranslations);

    console.log('Full build process completed successfully.');
}

main();
