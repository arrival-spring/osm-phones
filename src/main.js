const fs = require('fs');
const path = require('path');
const { PUBLIC_DIR, COUNTRIES } = require('./constants');
const { fetchAdminLevels: fetchAdminLevels, fetchOsmDataForDivision } = require('./osm-api');
const { safeName, validateNumbers } = require('./data-processor');
const {
    generateHtmlReport,
    generateMainIndexHtml,
    generateCountryIndexHtml
} = require('./html-utils');

async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR);
    }

    console.log('Starting full build process...');

    const countryStats = [];

    for (const countryKey in COUNTRIES) {
        const countryData = COUNTRIES[countryKey];
        const countryName = countryData.name;

        console.log(`Starting fetching divisions for ${countryName}...`);

        const countryDir = path.join(PUBLIC_DIR, safeName(countryName));
        if (!fs.existsSync(countryDir)) {
            fs.mkdirSync(countryDir, { recursive: true });
        }

        let totalInvalidCount = 0;
        let totalAutofixableCount = 0;
        let totalTotalNumbers = 0;
        const groupedDivisionStats = {};

        for (const divisionName in countryData.divisions) {
            const divisionAreaId = countryData.divisions[divisionName];
            console.log(`Processing subdivisions for ${divisionName}...`);

            const subdivisions = await fetchAdminLevels(divisionAreaId, divisionName, countryData.subdivisionAdminLevel);
            groupedDivisionStats[divisionName] = [];

            const processedSubDivisions = new Set();
            const uniqueSubdivisions = subdivisions.filter(subdivision => {
                if (processedSubDivisions.has(subdivision.name)) {
                    return false;
                }
                processedSubDivisions.add(subdivision.name);
                return true;
            });

            console.log(`Processing phone numbers for ${uniqueSubdivisions.length} subdivisions in ${divisionName}.`);

            // Testing: only get one subdivisions from each main division for now
            let subdivisionsProcessed = 0;
            for (const subdivision of uniqueSubdivisions) {
                if (subdivisionsProcessed >= 2) {
                    break;
                }

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

                await generateHtmlReport(countryName, subdivision, invalidNumbers, totalNumbers, countryData.locale);

                subdivisionsProcessed++;
            }
        }

        countryStats.push({
            name: countryName,
            invalidCount: totalInvalidCount,
            autoFixableCount: totalAutofixableCount,
            totalNumbers: totalTotalNumbers
        });

        generateCountryIndexHtml(countryName, groupedDivisionStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers, countryData.locale);
    }

    generateMainIndexHtml(countryStats);

    console.log('Full build process completed successfully.');
}

main();
