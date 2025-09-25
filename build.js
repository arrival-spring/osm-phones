const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

async function fetchCountiesGB() {
    // Testing ---------------
    const testCounties = {'Bedfordshire and Hertfordshire': 17623586, 'East Yorkshire and Northern Lincolnshire': 17623573, 'Devon': 17618825, 'Blackpool': 148603}

    // Convert the object into the expected array format
    return Object.entries(testCounties).map(([name, id]) => ({
        name: name,
        id: id
    }));
    // -----------------------

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
    //         throw new Error(`Overpass API response error: ${response.statusText}`);
    //     }
    //     const data = await response.json();
    //     return data.elements.map(el => ({
    //         name: el.tags.name,
    //         id: el.id
    //     }));
    // } catch (error) {
    //     console.error(`Error fetching county data for Great Britain:`, error);
    //     return [];
    // }
}

async function fetchOsmDataForCounty(county, retries = 3) {
    console.log(`Fetching data for county: ${county.name} (ID: ${county.id})...`);
    const { default: fetch } = await import('node-fetch');

    const areaId = county.id + 3600000000;
    const queryTimeout = 600;
    
    const overpassQuery = `
        [out:json][timeout:${queryTimeout}];
        area(${areaId})->.county;
        (
          node(area.county)["phone"~".*"];
          way(area.county)["phone"~".*"];
          relation(area.county)["phone"~".*"];
          node(area.county)["contact:phone"~".*"];
          way(area.county)["contact:phone"~".*"];
          relation(area.county)["contact:phone"~".*"];
        );
        out body geom;
    `;

    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(overpassQuery)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        
        if (response.status === 429 || response.status === 504) {
            if (retries > 0) {
                const retryAfter = response.headers.get('Retry-After') || 60;
                console.warn(`Received ${response.status}. Retrying in ${retryAfter} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return await fetchOsmDataForCounty(county, retries - 1);
            }
        }
        
        if (!response.ok) {
            throw new Error(`Overpass API response error: ${response.statusText}`);
        }
        const data = await response.json();
        return data.elements;
    } catch (error) {
        console.error(`Error fetching OSM data for ${county.name}:`, error);
        return [];
    }
}

function validateNumbers(elements) {
    const invalidItemsMap = new Map();
    let totalNumbers = 0;
  
    elements.forEach(element => {
      if (element.tags) { 
          const tags = element.tags;
          const phoneTags = ['phone', 'contact:phone'];
          const websiteTags = ['website', 'contact:website'];
  
          const website = websiteTags.map(tag => tags[tag]).find(url => url);
          const lat = element.lat || (element.center && element.center.lat);
          const lon = element.lon || (element.center && element.center.lon);
          const name = tags.name;
          const key = `${element.type}-${element.id}`;
  
          let foundInvalidNumber = false;
          
          for (const tag of phoneTags) {
            if (tags[tag]) {
              const numbers = tags[tag].split(';').map(s => s.trim());
              numbers.forEach(numberStr => {
                  totalNumbers++;
                  try {
                      const phoneNumber = parsePhoneNumber(numberStr, 'GB');
                      
                      const normalizedOriginal = numberStr.replace(/\s/g, '');
                      let normalizedParsed = '';
                      if (phoneNumber && phoneNumber.isValid()) {
                          normalizedParsed = phoneNumber.number.replace(/\s/g, '');
                      }
                      
                      const isInvalid = normalizedOriginal !== normalizedParsed;
                      
                      if (isInvalid) {
                          foundInvalidNumber = true;
                          if (!invalidItemsMap.has(key)) {
                              invalidItemsMap.set(key, {
                                  type: element.type,
                                  id: element.id,
                                  osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
                                  tag: tag,
                                  website: website,
                                  lat: lat,
                                  lon: lon,
                                  name: name,
                                  allTags: tags,
                                  invalidNumbers: [],
                                  suggestedFixes: [],
                                  autoFixable: true
                              });
                          }
                          const item = invalidItemsMap.get(key);
                          item.invalidNumbers.push(numberStr);
                          item.suggestedFixes.push(phoneNumber ? phoneNumber.format('INTERNATIONAL') : 'No fix available');
                          if (!phoneNumber || !phoneNumber.isValid()) {
                              item.autoFixable = false;
                          }
                      }
                  } catch (e) {
                      foundInvalidNumber = true;
                      if (!invalidItemsMap.has(key)) {
                          invalidItemsMap.set(key, {
                              type: element.type,
                              id: element.id,
                              osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
                              tag: tag,
                              website: website,
                              lat: lat,
                              lon: lon,
                              name: name,
                              allTags: tags,
                              invalidNumbers: [],
                              suggestedFixes: [],
                              autoFixable: false,
                              error: e.message
                          });
                      }
                      const item = invalidItemsMap.get(key);
                      item.invalidNumbers.push(numberStr);
                      item.suggestedFixes.push('No fix available');
                      item.autoFixable = false;
                  }
              });
            }
          }
      }
    });
  
    return { invalidNumbers: Array.from(invalidItemsMap.values()), totalNumbers };
  }

  function getFeatureTypeName(item) {
    if (item.name) {
        return `${item.name}`;
    }

    const featureTags = ['amenity', 'shop', 'tourism', 'leisure', 'emergency', 'building', 'craft', 'aeroway', 'railway', 'healthcare', 'highway', 'military', 'man_made', 'public_transport'];
    let featureType = null;
    for (const tag of featureTags) {
        if (item.allTags[tag]) {
            featureType = item.allTags[tag];
            break;
        }
    }

    if (featureType) {
        const formattedType = featureType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `${formattedType}`;
    } else {
        const formattedType = item.type.replace(/\b\w/g, c => c.toUpperCase());
        return `OSM ${formattedType}`;
    }
}

function generateHtmlReport(county, invalidNumbers, totalNumbers) {
    const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
    const filePath = path.join(PUBLIC_DIR, `${safeCountyName}.html`);

    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);
    const manualFixNumbers = invalidNumbers.filter(item => !item.autoFixable);

    const josmBaseUrl = 'http://127.0.0.1:8111/load_object';
    const idBaseUrl = 'https://www.openstreetmap.org/edit?editor=id&map=19/';

    // Create a single function to generate a list item
    function createListItem(item) {
        const phoneNumber = item.invalidNumbers.join('; ');
        const fixedNumber = item.suggestedFixes.join('; ')
        const idEditUrl = `${idBaseUrl}${item.lat}/${item.lon}&${item.type}=${item.id}`;
        const josmEditUrl = `${josmBaseUrl}?objects=${item.type}${item.id}`;
        const josmFixUrl = item.autoFixable ? `${josmEditUrl}&addtags=${item.tag}=${encodeURIComponent(fixedNumber)}` : null;

        const idEditButton = `<a href="${idEditUrl}" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors" target="_blank">Edit in iD</a>`;
        const josmEditButton = `<a href="${josmEditUrl}" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors" target="_blank">Edit in JOSM</a>`;
        const josmFixButton = josmFixUrl ? `<a href="${josmFixUrl}" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors" target="_blank">Fix in JOSM</a>` : '';

        const fixableTag = item.autoFixable ? `<span class="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-200 text-yellow-800">Fixable</span>` : '';
        const suggestedFix = item.autoFixable ? `<span class="font-semibold">Suggested fix:</span> ${fixedNumber}` : '';
        const errorMessage = item.error ? `<p class="text-sm text-red-500 mt-1"><span class="font-bold">Reason:</span> ${item.error}</p>` : '';

        return `
            <li class="bg-white rounded-xl shadow-md p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-900">${getFeatureTypeName(item)}</h3>
                    <div class="grid grid-cols-[max-content,1fr] gap-x-4">
                        <div class="col-span-1">
                            <span class="font-semibold">Phone:</span>
                        </div>
                        <div class="col-span-1">
                            <span>${phoneNumber}</span>
                        </div>

                        <div class="col-span-1">
                            <span class="font-semibold">Suggested fix:</span>
                        </div>
                        <div class="col-span-1">
                            <span>${fixedNumber}</span>
                        </div>
                    </div>
                    ${errorMessage}
                </div>
                <div class="flex-shrink-0 flex items-center space-x-2">
                    ${fixableTag}
                    ${idEditButton}
                    ${josmEditButton}
                    ${josmFixButton}
                </div>
            </li>
        `;
    }

    // Use the new function to map over the arrays
    const fixableListContent = autofixableNumbers.length > 0 ?
        autofixableNumbers.map(createListItem).join('') :
        `<li class="bg-white rounded-xl shadow-md p-6 text-center text-gray-500">No automatically fixable phone numbers found in this county.</li>`;

    const invalidListContent = manualFixNumbers.length > 0 ?
        manualFixNumbers.map(createListItem).join('') :
        `<li class="bg-white rounded-xl shadow-md p-6 text-center text-gray-500">No invalid phone numbers found in this county.</li>`;

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
                    <span class="align-middle">Back to county list</span>
                </a>
                <h1 class="text-4xl font-extrabold text-gray-900">Phone Number Report</h1>
                <h2 class="text-2xl font-semibold text-gray-700 mt-2">${county.name}</h2>
                <p class="text-sm text-gray-500 mt-2">${invalidNumbers.length} invalid phone numbers found (${autofixableNumbers.length} potentially fixable automatically).</p>
            </header>
            <div class="bg-white rounded-xl shadow-lg p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
                <div>
                    <p class="text-4xl font-extrabold text-blue-600">${invalidNumbers.length.toLocaleString()}</p>
                    <p class="text-sm text-gray-500">Total Invalid Numbers</p>
                </div>
                <div>
                    <p class="text-4xl font-extrabold text-green-600">${autofixableNumbers.length.toLocaleString()}</p>
                    <p class="text-sm text-gray-500">Potentially Fixable</p>
                </div>
                <div>
                    <p class="text-4xl font-extrabold text-gray-800">${totalNumbers.toLocaleString()}</p>
                    <p class="text-sm text-gray-500">Total Numbers Checked</p>
                </div>
            </div>
            <h2 class="text-2xl font-semibold text-gray-900 mt-2">Fixable numbers</h2>
            <ul class="space-y-4">
                ${fixableListContent}
            </ul>
            <h2 class="text-2xl font-semibold text-gray-900 mt-2">Invalid numbers</h2>
            <ul class="space-y-4">
                ${invalidListContent}
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


                    function getBackgroundColor(percent) {
                        if (percent > 2) {
                            // Red for anything below 98%
                            return \`hsl(0, 70%, 50%)\`;
                        }
                        // Scale green from 98% to 100%
                        const hue = ((2 - percent) / 2) * 120;
                        return \`hsl(\${hue}, 70%, 50%)\`;
                        }

                    // const getBackgroundColor = (percent) => {
                    //     const hue = (100 - percent) * 1.2;
                    //     return \`hsl(\${hue}, 70%, 50%)\`;
                    // };
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
        
        generateHtmlReport(county, invalidNumbers, totalNumbers);
    }
    
    generateIndexHtml(countyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers);

    console.log('Full build process completed successfully.');
}

main();
