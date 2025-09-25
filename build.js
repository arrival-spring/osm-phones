const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// This regular expression is a bit lenient to allow for various formats.
// It matches sequences of numbers, spaces, and common phone characters.
const PHONE_NUMBER_REGEX = /[+\d\s().-]{7,}/;

function validateNumber(element) {
    const phoneNumber = element.tags.phone;
    const isFixable = false;
    let autoFixable = false;

    // Check for "invalid" or "disused" tags
    if (element.tags.invalid || element.tags.disused) {
        return { valid: false, reason: "Tagged as invalid or disused" };
    }

    // Check if the number is already tagged as a landline or mobile
    if (element.tags.phone_type === 'landline' || element.tags.phone_type === 'mobile') {
        return { valid: true };
    }

    if (!phoneNumber) {
        return { valid: false, reason: "No phone number found" };
    }

    try {
        const parsed = parsePhoneNumber(phoneNumber, 'GB');
        if (parsed && parsed.isValid()) {
            return { valid: true };
        } else {
            // Attempt a lenient autofix for numbers that look almost valid
            const cleanedNumber = phoneNumber.replace(/[^+\d]/g, '');
            const parsedClean = parsePhoneNumber(cleanedNumber, 'GB');
            if (parsedClean && parsedClean.isValid()) {
                autoFixable = true;
                return { valid: false, reason: "Number is invalid but could be fixed by removing non-digit characters", autoFixable: true, fixable: true };
            }
        }
    } catch (e) {
        // Fallback to regex check for more complex cases
        if (PHONE_NUMBER_REGEX.test(phoneNumber)) {
            return { valid: false, reason: "Lacks a proper country code, but looks like a number", fixable: true };
        }
    }
    return { valid: false, reason: `Invalid format: ${phoneNumber}` };
}

function validateNumbers(elements) {
    const invalidNumbers = [];
    let totalNumbers = 0;

    for (const element of elements) {
        if (element.tags && element.tags.phone) {
            totalNumbers++;
            const result = validateNumber(element);
            if (!result.valid) {
                invalidNumbers.push({
                    ...element,
                    ...result
                });
            }
        }
    }
    return { invalidNumbers, totalNumbers };
}

async function fetchCountiesGB() {
    // Testing ----------------
    const testCounties = {'Bedfordshire and Hertfordshire': 17623586, 'East Yorkshire and Northern Lincolnshire': 17623573, 'Devon': 17618825, 'Blackpool': 148603}

    // Convert the object into the expected array format
    return Object.entries(testCounties).map(([name, id]) => ({
        name: name,
        id: id
    }));

    // ------------------------


    // console.log('Fetching all counties for Great Britain...');
    // const { default: fetch } = await import('node-fetch');

    // const queryTimeout = 180;
    
    // // This query fetches all administrative level 6 relations within the UK
    // // It is a small, fast query that is unlikely to time out
    // const query = `
    //     [out:json][timeout:${queryTimeout}];
    //     area[name="United Kingdom"]->.uk;
    //     rel(area.uk)["admin_level"="6"]["name"];
    //     out body;
    // `;
    
    // try {
    //     const response = await fetch(OVERPASS_API_URL, {
    //         method: 'POST',
    //         body: `data=${encodeURIComponent(query)}`,
    //         headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //     });

    //     if (!response.ok) {
    //         throw new Error(`Overpass API responded with status code: ${response.status}`);
    //     }

    //     const data = await response.json();
    //     const counties = data.elements.map(el => ({
    //         name: el.tags.name,
    //         id: el.id,
    //     }));
    //     console.log(`Found ${counties.length} counties.`);
    //     return counties;

    // } catch (error) {
    //     console.error('Failed to fetch counties from Overpass API:', error);
    //     return [];
    // }
}


async function fetchOsmDataForCounty(county) {
    const { default: fetch } = await import('node-fetch');

    const query = `
        [out:json][timeout:180];
        (
            nwr(area:${county.id})[amenity=pub][phone];
            nwr(area:${county.id})[amenity=restaurant][phone];
            nwr(area:${county.id})[amenity=cafe][phone];
            nwr(area:${county.id})[amenity=fast_food][phone];
            nwr(area:${county.id})[amenity=bar][phone];
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
            throw new Error(`Overpass API responded with status code: ${response.status}`);
        }

        const data = await response.json();
        return data.elements;
    } catch (error) {
        console.error(`Failed to fetch OSM data for ${county.name}:`, error);
        return [];
    }
}

function generateHtmlReport(county, invalidNumbers) {
    const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
    const filePath = path.join(PUBLIC_DIR, `${safeCountyName}.html`);

    const joshmBaseUrl = 'http://127.0.0.1:8111/load_and_zoom';

    let listContent = '';
    if (invalidNumbers.length > 0) {
        listContent = invalidNumbers.map(item => {
            const phoneNumber = item.tags.phone.split(';').join(', ');
            const isFixable = item.fixable || item.autoFixable;
            const fixableTag = isFixable ? '<span class="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-200 text-yellow-800">Fixable</span>' : '';
            const joshmUrl = `${joshmBaseUrl}?select=${item.type}${item.id}`;
            const joshmButton = isFixable ? `<a href="${joshmUrl}" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors" target="_blank">Fix in JOSM</a>` : '';

            return `
            <li class="bg-white rounded-xl shadow-md p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-900">${item.tags.name || item.tags.amenity || 'Unnamed Place'}</h3>
                    <p class="text-sm text-gray-500">
                        <span class="font-semibold">Phone:</span> ${phoneNumber}
                    </p>
                    <p class="text-sm text-red-500 mt-1">
                        <span class="font-bold">Reason:</span> ${item.reason}
                    </p>
                </div>
                <div class="flex-shrink-0 flex items-center space-x-2">
                    ${fixableTag}
                    ${joshmButton}
                </div>
            </li>
            `;
        }).join('');
    } else {
        listContent = `
        <li class="bg-white rounded-xl shadow-md p-6 text-center text-gray-500">
            No invalid phone numbers found in this county.
        </li>
        `;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Phone Number Report for ${county.name}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-4xl mx-auto space-y-8">
            <header class="text-center">
                <a href="index.html" class="inline-block mb-4 text-blue-500 hover:text-blue-700 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 inline-block align-middle mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span class="align-middle">Back to Index</span>
                </a>
                <h1 class="text-4xl font-extrabold text-gray-900">Phone Number Report</h1>
                <h2 class="text-2xl font-semibold text-gray-700 mt-2">${county.name}</h2>
                <p class="text-sm text-gray-500 mt-2">Invalid phone numbers found in commercial establishments.</p>
            </header>
            <ul class="space-y-4">
                ${listContent}
            </ul>
        </div>
    </body>
    </html>
    `;
    fs.writeFileSync(filePath, htmlContent);
    console.log(`Generated report for ${county.name} at ${filePath}`);
}

function generateIndexHtml(countyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers) {
    const sortedStats = countyStats.sort((a, b) => b.invalidCount - a.invalidCount);
    
    let statsContent = '';
    const totalPercentage = totalTotalNumbers > 0 ? ((totalInvalidCount / totalTotalNumbers) * 100).toFixed(2) : '0.00';
    const totalFixablePercentage = totalInvalidCount > 0 ? ((totalAutofixableCount / totalInvalidCount) * 100).toFixed(2) : '0.00';

    const renderListScript = `
        <script>
            const countyStats = ${JSON.stringify(sortedStats)};
            const totalInvalidCount = ${totalInvalidCount};
            const totalTotalNumbers = ${totalTotalNumbers};
            const listContainer = document.getElementById('county-list');

            function renderList() {
                listContainer.innerHTML = ''; // Clear existing list

                // Sort the data based on the selected option
                const sortSelect = document.getElementById('sort-by');
                const sortBy = sortSelect.value;
                const sortedData = [...countyStats].sort((a, b) => {
                    if (sortBy === 'invalidCount') {
                        return b.invalidCount - a.invalidCount;
                    } else if (sortBy === 'name') {
                        return a.name.localeCompare(b.name);
                    }
                });

                sortedData.forEach(county => {
                    const safeCountyName = county.name.replace(/\\s+|\\//g, '-').toLowerCase();
                    const percentage = county.totalNumbers > 0 ? (county.invalidCount / county.totalNumbers) * 100 : 0;
                    const validPercentage = Math.max(0, Math.min(100, percentage));

                    const getBackgroundColor = (percent) => {
                        const hue = (100 - percent) * 1.2;
                        return \`hsl(\${hue}, 70%, 50%)\`;
                    };
                    const backgroundColor = getBackgroundColor(validPercentage);

                    const li = document.createElement('li');
                    li.className = 'bg-white rounded-xl shadow-lg p-6 flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 transition-transform transform hover:scale-105';
                    li.innerHTML = \`
                        <a href="\${safeCountyName}.html" class="flex-grow flex items-center space-x-4">
                            <div class="h-12 w-12 rounded-full flex-shrink-0" style="background-color: \${backgroundColor};"></div>
                            <div class="flex-grow">
                                <h3 class="text-xl font-bold text-gray-900">\${county.name}</h3>
                                <p class="text-sm text-gray-500">\${county.invalidCount} invalid numbers out of \${county.totalNumbers}</p>
                            </div>
                        </a>
                        <div class="text-center sm:text-right">
                            <p class="text-2xl font-bold text-gray-800">\${validPercentage.toFixed(2)}<span class="text-base font-normal">%</span></p>
                            <p class="text-xs text-gray-500">of total</p>
                        </div>
                    \`;
                    listContainer.appendChild(li);
                });
            }

            document.getElementById('sort-by').addEventListener('change', renderList);

            // Initial render
            renderList();
        </script>
    `;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OSM Phone Number Validation Report</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; }
        </style>
    </head>
    <body class="p-8">
        <div class="max-w-5xl mx-auto space-y-8">
            <header class="text-center space-y-2">
                <h1 class="text-4xl font-extrabold text-gray-900">OSM Phone Number Validation</h1>
                <p class="text-sm text-gray-500">A report on invalid phone numbers in OpenStreetMap data for Great Britain.</p>
            </header>
            
            <div class="bg-white rounded-xl shadow-lg p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                <div>
                    <p class="text-4xl font-extrabold text-blue-600">${totalInvalidCount.toLocaleString()}</p>
                    <p class="text-sm text-gray-500">Total Invalid Numbers</p>
                </div>
                <div>
                    <p class="text-4xl font-extrabold text-green-600">${totalAutofixableCount.toLocaleString()}</p>
                    <p class="text-sm text-gray-500">Potentially Fixable</p>
                </div>
                <div>
                    <p class="text-4xl font-extrabold text-gray-800">${totalTotalNumbers.toLocaleString()}</p>
                    <p class="text-sm text-gray-500">Total Numbers Checked</p>
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-lg p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">County Reports</h2>
                    <div class="mt-4 sm:mt-0">
                        <label for="sort-by" class="mr-2 text-sm font-medium text-gray-700">Sort by:</label>
                        <select id="sort-by" class="rounded-md border-gray-300 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50">
                            <option value="invalidCount">Invalid Count (desc)</option>
                            <option value="name">Name (A-Z)</option>
                        </select>
                    </div>
                </div>
                <ul id="county-list" class="space-y-4">
                    <!-- County reports will be dynamically inserted here by JavaScript -->
                </ul>
            </div>
        </div>
        ${renderListScript}
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
