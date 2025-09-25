const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// Fetches a list of administrative level 6 relations (count-ies) in Great Britain.
async function fetchCountiesGB() {
    console.log('Fetching all counties for Great Britain...');
    const { default: fetch } = await import('node-fetch');

    const queryTimeout = 180;
    
    const query = `
        [out:json][timeout:${queryTimeout}];
        area[name="United Kingdom"]->.uk;
        rel(area.uk)["admin_level"="6"]["name"];
        out body;
    `;
    
    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        const counties = data.elements.map(el => ({
            name: el.tags.name,
            id: el.id
        }));
        
        // This is a simple test set to speed up development
        const testCounties = [{ name: 'Bedfordshire and Hertfordshire', id: 17623586 }, { name: 'East Yorkshire and Northern Lincolnshire', id: 17623573 }, { name: 'Devon', id: 17618825 }, { name: 'Blackpool', id: 17621111 }];
        return testCounties;
    } catch (error) {
        console.error('Error fetching counties:', error);
        return [];
    }
}

// Fetches phone numbers for a specific county from Overpass API.
async function fetchOsmDataForCounty(county) {
    const { default: fetch } = await import('node-fetch');
    const queryTimeout = 300;
    
    const query = `
        [out:json][timeout:${queryTimeout}];
        area(${county.id})->.county;
        (
            node["phone"](area.county);
            way["phone"](area.county);
            relation["phone"](area.county);
            node["contact:phone"](area.county);
            way["contact:phone"](area.county);
            relation["contact:phone"](area.county);
        );
        out body;
    `;
    
    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Fetched ${data.elements.length} elements for ${county.name}.`);
        return data.elements;
    } catch (error) {
        console.error(`Error fetching OSM data for ${county.name}:`, error);
        return [];
    }
}

// Validates a list of OpenStreetMap elements containing phone numbers.
function validateNumbers(elements) {
    const invalidNumbers = [];
    let totalNumbers = 0;
    
    // Filter elements to only include those with a 'phone' or 'contact:phone' tag
    const phoneElements = elements.filter(el => el.tags?.phone || el.tags?.['contact:phone']);
    totalNumbers = phoneElements.length;

    for (const el of phoneElements) {
        const numberString = el.tags.phone || el.tags['contact:phone'];
        try {
            // Using 'GB' as the region code for accurate parsing.
            const phoneNumber = parsePhoneNumber(numberString, 'GB');
            if (!phoneNumber || !phoneNumber.isValid()) {
                invalidNumbers.push({
                    number: numberString,
                    originalElement: el,
                    // Check if the number is possibly valid even if not fully validated, to offer an autofix option.
                    autoFixable: phoneNumber?.isPossible() || false
                });
            }
        } catch (e) {
            // This handles cases where the number string is so malformed it causes an error
            invalidNumbers.push({
                number: numberString,
                originalElement: el,
                autoFixable: false
            });
        }
    }
    
    return { invalidNumbers, totalNumbers };
}

// Generates an HTML report for a specific county with a list of invalid numbers.
function generateHtmlReport(county, invalidNumbers) {
    let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${county.name} Phone Number Report</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body { font-family: sans-serif; }
            </style>
        </head>
        <body class="bg-slate-50 text-slate-800 p-8">
            <div class="max-w-4xl mx-auto">
                <h1 class="text-3xl font-bold mb-6 text-indigo-700">Invalid Phone Numbers in ${county.name}</h1>
    `;

    if (invalidNumbers.length === 0) {
        htmlContent += `<p class="text-green-600 font-semibold text-lg">No invalid phone numbers found in this county. Great job!</p>`;
    } else {
        htmlContent += `
                <p class="text-lg mb-4">Total invalid numbers: <span class="font-bold">${invalidNumbers.length}</span></p>
                <ul class="space-y-4">
        `;
        invalidNumbers.forEach(item => {
            htmlContent += `
                    <li class="bg-white p-6 rounded-lg shadow-md border border-slate-200">
                        <p class="text-red-500 font-bold text-xl mb-2">Number: ${item.number}</p>
                        <p class="text-sm text-slate-600">OpenStreetMap Element ID: <a href="https://www.openstreetmap.org/${item.originalElement.type}/${item.originalElement.id}" target="_blank" class="text-indigo-600 hover:underline font-medium">${item.originalElement.id}</a></p>
                        <p class="text-sm text-slate-600 mt-1">Tags: <code class="bg-slate-100 p-1 rounded text-xs font-mono">${JSON.stringify(item.originalElement.tags)}</code></p>
                        ${item.autofixable ? '<p class="text-yellow-500 italic mt-2 text-sm font-medium">This number might be autofixable.</p>' : ''}
                    </li>
            `;
        });
        htmlContent += `</ul>`;
    }

    htmlContent += `
            </div>
        </body>
        </html>
    `;
    fs.writeFileSync(path.join(PUBLIC_DIR, `${county.name.toLowerCase().replace(/ /g, '-')}.html`), htmlContent);
    console.log(`Generated report for ${county.name} at ${path.join(PUBLIC_DIR, `${county.name.toLowerCase().replace(/ /g, '-')}.html`)}`);
}

// Generates the main index.html page.
function generateIndexHtml(countyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers) {
    let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>OSM Phone Number Validation Report</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                body { font-family: sans-serif; }
            </style>
        </head>
        <body class="bg-slate-50 text-slate-800 p-8">
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-extrabold mb-8 text-center text-indigo-800">OSM Phone Number Validation Report</h1>
                <div class="bg-white p-6 rounded-xl shadow-lg border border-slate-200 mb-8">
                    <h2 class="text-2xl font-semibold mb-4 text-indigo-600">Summary Statistics</h2>
                    <p class="text-lg mb-2">Total numbers processed: <span class="font-bold text-indigo-700">${totalTotalNumbers}</span></p>
                    <p class="text-lg mb-2">Total invalid numbers: <span class="font-bold ${totalInvalidCount > 0 ? 'text-red-500' : 'text-green-500'}">${totalInvalidCount}</span></p>
                    <p class="text-lg">Total autofixable numbers: <span class="font-bold text-yellow-500">${totalAutofixableCount}</span></p>
                </div>
                <h2 class="text-2xl font-semibold mb-4 text-indigo-600">Reports by County</h2>
                <ul class="space-y-4">
    `;
    
    countyStats.forEach(stats => {
        const invalidColor = stats.invalidCount > 0 ? 'text-red-500' : 'text-green-500';
        htmlContent += `
                    <li class="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex justify-between items-center">
                        <a href="${stats.name.toLowerCase().replace(/ /g, '-')}.html" class="text-lg text-indigo-600 hover:underline font-medium">${stats.name}</a>
                        <span class="font-bold ${invalidColor}">
                            ${stats.invalidCount} invalid numbers
                        </span>
                        <span class="text-sm text-slate-500">
                            (${stats.totalNumbers} total)
                        </span>
                    </li>
        `;
    });
    
    htmlContent += `
                </ul>
            </div>
        </body>
        </html>
    `;
    fs.writeFileSync(path.join(PUBLIC_DIR, 'index.html'), htmlContent);
    console.log('Main index.html generated.');
}

async function main() {
    if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR);
    }
    
    console.log('Starting full build process...');

    const ukCounties = await fetchCountiesGB();
    
    console.log(`Processing phone numbers for ${ukCounties.length} counties.`);
    
    const countyStats = [];
    let totalInvalidCount = 0;
    let totalAutofixableCount = 0;
    let totalTotalNumbers = 0;
    
    for (const county of ukCounties) {
        const elements = await fetchOsmDataForCounty(county);
        const { invalidNumbers, totalNumbers } = validateNumbers(elements);
        
        const autoFixableCount = invalidNumbers.filter(item => item.autoFixable).length;

        countyStats.push({
            name: county.name,
            invalidCount: invalidNumbers.length,
            autoFixableCount: autoFixableCount,
            totalNumbers: totalNumbers
        });
        
        totalInvalidCount += invalidNumbers.length;
        totalAutofixableCount += autoFixableCount;
        totalTotalNumbers += totalNumbers;
        
        generateHtmlReport(county, invalidNumbers);
    }
    
    generateIndexHtml(countyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers);

    console.log('Full build process completed successfully.');
}

main();
