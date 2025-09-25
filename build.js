const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const NATIONS = {
    'England': 3600058447,
    'Scotland': 3600058446,
    'Wales': 3600058437,
    'Northern Ireland': 3600156393
};

async function fetchCountiesUK(nationAreaId) {
    console.log('Fetching all counties for the current nation...');
    const { default: fetch } = await import('node-fetch');

    const queryTimeout = 180;
    
    // This query fetches all administrative level 6 relations within the region
    // It is a small, fast query that is unlikely to time out
    const query = `
        [out:json][timeout:${queryTimeout}];
        area[name="${nationAreaId}"]->.nation;
        rel(area.nation)["admin_level"="6"]["name"];
        out body;
    `;
    
    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (!response.ok) {
            throw new Error(`Overpass API response error: ${response.statusText}`);
        }
        const data = await response.json();
        return data.elements.map(el => ({
            name: el.tags.name,
            id: el.id
        }));
    } catch (error) {
        console.error(`Error fetching county data for Great Britain:`, error);
        return [];
    }
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

function createStatsBox(total, invalid, fixable) {
    const totalPercentage = total > 0 ? ((invalid / total) * 100).toFixed(2) : '0.00';
    const fixablePercentage = invalid > 0 ? ((fixable / invalid) * 100).toFixed(2) : '0.00';

    return `
        <div class="bg-white rounded-xl shadow-lg p-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            <div>
                <p class="text-4xl font-extrabold text-gray-800">${total.toLocaleString()}</p>
                <p class="text-sm text-gray-500">Numbers Checked</p>
            </div>
            <div>
                <p class="text-4xl font-extrabold text-blue-700">${invalid.toLocaleString()}</p>
                <p class="text-gray-500">Invalid Numbers</p>
                <p class="text-sm text-gray-400">${totalPercentage.toLocaleString()}% of total</p>
            </div>
            <div>
                <p class="text-4xl font-extrabold text-green-700">${fixable.toLocaleString()}</p>
                <p class="text-gray-500">Potentially Fixable</p>
                <p class="text-sm text-gray-400">${fixablePercentage.toLocaleString()}% of invalid</p>
            </div>
            
        </div>
    `;
}

function createFooter(dataTimestamp) {
    // Formatting the date and time
    const formattedDate = dataTimestamp.toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const formattedTime = dataTimestamp.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Calculating hours ago
    const now = new Date();
    const millisecondsAgo = now - dataTimestamp;
    const hoursAgo = Math.floor(millisecondsAgo / (1000 * 60 * 60));

    return `
    <p class="text-sm text-gray-500 mt-2">Data sourced on ${formattedDate} at ${formattedTime} UTC (${hoursAgo} hours ago)</p>
    <p class="text-sm text-gray-500 mt-2">Got a suggestion or an issue? <a href="https://github.com/arrival-spring/osm-phones/" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 underline transition-colors">Let me know on GitHub</a>.</p>
    `
}

function generateHtmlReport(county, invalidNumbers, totalNumbers, dataTimestamp) {
    const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
    const filePath = path.join(PUBLIC_DIR, `${safeCountyName}.html`);

    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);
    const manualFixNumbers = invalidNumbers.filter(item => !item.autoFixable);

    const josmBaseUrl = 'http://127.0.0.1:8111/load_object';
    const idBaseUrl = 'https://www.openstreetmap.org/edit?editor=id&map=19/';

    function createListItem(item) {
        const phoneNumber = item.invalidNumbers.join('; ');
        const fixedNumber = item.suggestedFixes.join('; ');
        const idEditUrl = `${idBaseUrl}${item.lat}/${item.lon}&${item.type}=${item.id}`;
        const josmEditUrl = `${josmBaseUrl}?objects=${item.type}${item.id}`;
        const josmFixUrl = item.autoFixable ? `${josmEditUrl}&addtags=${item.tag}=${encodeURIComponent(fixedNumber)}` : null;
    
        const idEditButton = `<a href="${idEditUrl}" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors" target="_blank">Edit in iD</a>`;
        const josmEditButton = `<a href="#" onclick="fixWithJosm('${josmEditUrl}', event)" class="inline-flex items-center rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 transition-colors">Edit in JOSM</a>`;
        const josmFixButton = josmFixUrl ? `<a href="#" onclick="fixWithJosm('${josmFixUrl}', event)" class="inline-flex items-center rounded-full bg-yellow-200 px-3 py-1.5 text-sm font-semibold text-yello-800 shadow-sm hover:bg-yellow-300 transition-colors">Fix in JOSM</a>` : '';
        const websiteButton = item.website ? `<a href="${item.website}" class="inline-flex items-center rounded-full bg-green-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-600 transition-colors" target="_blank">Website</a>` : '';
    
        const errorMessage = item.error ? `<p class="text-sm text-red-500 mt-1"><span class="font-bold">Reason:</span> ${item.error}</p>` : '';
    
        return `
            <li class="bg-white rounded-xl shadow-md p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
                <div>
                    <h3 class="text-lg font-bold text-gray-900">
                        <a href="${item.osmUrl}" target="_blank" rel="noopener noreferrer" class="hover:text-gray-950 underline transition-colors">${getFeatureTypeName(item)}</a>
                    </h3>
                    <div class="grid grid-cols-[max-content,1fr] gap-x-4">
                        <div class="col-span-1">
                            <span class="font-semibold">Phone:</span>
                        </div>
                        <div class="col-span-1">
                            <span>${phoneNumber}</span>
                        </div>
                        ${item.autoFixable ? `
                        <div class="col-span-1">
                            <span class="font-semibold">Suggested fix:</span>
                        </div>
                        <div class="col-span-1">
                            <span>${fixedNumber}</span>
                        </div>
                        ` : ''}
                    </div>
                    ${errorMessage}
                </div>
                
                <div class="flex-shrink-0 flex flex-wrap items-center gap-2">
                    ${websiteButton}
                    ${josmFixButton}
                    ${idEditButton}
                    ${josmEditButton}
                </div>
            </li>
        `;
    }

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
            </header>
            ${createStatsBox(totalNumbers, invalidNumbers.length, autofixableNumbers.length)}
            <div class="text-center">
                <h2 class="text-2xl font-semibold text-gray-900">Fixable numbers</h2>
                <p class="text-sm text-gray-500 mt-2">These numbers appear to be valid UK numbers but are formatted incorrectly. The suggested fix assumes that they are indeed UK numbers. Not all 'auto' fixes are necessarily valid, so please do not blindly click on all the fix links without first verifying the number.</p>
            </div>
            <ul class="space-y-4">
                ${fixableListContent}
            </ul>
            <div class="text-center">
                <h2 class="text-2xl font-semibold text-gray-900">Invalid numbers</h2>
                <p class="text-sm text-gray-500 mt-2">These numbers are all invalid in some way; maybe they are too long or too short, or perhaps they're missing an area code. The website could be used to check for a valid number, or a survey may be necessary.</p>
            </div>
            <ul class="space-y-4">
                ${invalidListContent}
            </ul>
            <div class="bg-white rounded-xl shadow-lg p-2 text-center">
                ${createFooter(dataTimestamp)}
            </div>
        </div>
    <script>
        function fixWithJosm(url, event) {
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
    </script>
    </body>
    </html>
    `;
    fs.writeFileSync(filePath, htmlContent);
    console.log(`Generated report for ${county.name} at ${filePath}`);
}

function generateIndexHtml(groupedCountyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers, dataTimestamp) {
    const renderListScript = `
        <script>
            const groupedCountyStats = ${JSON.stringify(groupedCountyStats)};
            const listContainer = document.getElementById('county-list');
            const sortButtons = document.querySelectorAll('.sort-btn');
            const hideEmptyCheckbox = document.getElementById('hide-empty');
            let currentSort = 'invalidCount';

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

            function renderList() {
                listContainer.innerHTML = '';
                
                for (const nationName in groupedCountyStats) {
                    let sortedData = [...groupedCountyStats[nationName]];
                    
                    if (hideEmptyCheckbox.checked) {
                        sortedData = sortedData.filter(county => county.invalidCount > 0);
                    }
                    
                    if (sortedData.length > 0) {
                        // Sort within each nation
                        sortedData.sort((a, b) => {
                            if (currentSort === 'invalidCount') {
                                return b.invalidCount - a.invalidCount;
                            } else if (currentSort === 'name') {
                                return a.name.localeCompare(b.name);
                            }
                        });

                        const nationHeader = document.createElement('h2');
                        nationHeader.className = 'text-2xl font-bold text-gray-900 mt-8 mb-4';
                        nationHeader.textContent = nationName;
                        listContainer.appendChild(nationHeader);
                        
                        const ul = document.createElement('ul');
                        ul.className = 'space-y-4';

                        sortedData.forEach(county => {
                            const safeCountyName = county.name.replace(/\\s+|\\//g, '-').toLowerCase();
                            const percentage = county.totalNumbers > 0 ? (county.invalidCount / county.totalNumbers) * 100 : 0;
                            const validPercentage = Math.max(0, Math.min(100, percentage));

                            function getBackgroundColor(percent) {
                                if (percent > 2) {
                                    return \`hsl(0, 70%, 50%)\`;
                                }
                                const hue = ((2 - percent) / 2) * 120;
                                return \`hsl(\${hue}, 70%, 50%)\`;
                            }
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
                            ul.appendChild(li);
                        });
                        listContainer.appendChild(ul);
                    }
                }

                if (listContainer.innerHTML === '') {
                    const li = document.createElement('li');
                    li.className = 'bg-white rounded-xl shadow-lg p-6 text-center text-gray-500';
                    li.textContent = 'No counties with invalid numbers found.';
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
                <p class="text-sm text-gray-500">A report on invalid phone numbers in OpenStreetMap data for the United Kingdom.</p>
            </header>
            ${createStatsBox(totalTotalNumbers, totalInvalidCount, totalAutofixableCount)}
            <div class="bg-white rounded-xl shadow-lg p-6">
                <div class="flex flex-col sm:flex-row justify-between items-center mb-6">
                    <h2 class="text-2xl font-bold text-gray-900">County Reports</h2>
                    <div class="flex items-center space-x-4 mt-4 sm:mt-0">
                        <div class="flex items-center">
                            <input type="checkbox" id="hide-empty" checked class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300">
                            <label for="hide-empty" class="ml-2 text-sm font-medium text-gray-700">Hide counties with no issues</label>
                        </div>
                        <div class="flex items-center space-x-2">
                            <span class="mr-2 text-sm font-medium text-gray-700">Sort by:</span>
                            <button id="sort-invalid" data-sort="invalidCount" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">Invalid Count</button>
                            <button id="sort-name" data-sort="name" class="sort-btn px-4 py-2 rounded-md text-sm font-medium transition-colors">Name</button>
                        </div>
                    </div>
                </div>
                <div id="county-list" class="space-y-4">
                </div>
            </div>
            <div class="bg-white rounded-xl shadow-lg p-2 text-center">
                ${createFooter(dataTimestamp)}
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

    const dataTimestamp = new Date();

    const countyStats = [];
    const groupedCountyStats = {};

    let totalInvalidCount = 0;
    let totalAutofixableCount = 0;
    let totalTotalNumbers = 0;

    for (const [nationName, nationAreaId] of Object.entries(NATIONS)) {
        console.log(`Processing counties for ${nationName}...`);
        
        // Fetch counties for the current nation
        const counties = await fetchCountiesUK(nationAreaId);
        groupedCountyStats[nationName] = [];

        for (const county of counties) {
            console.log(`Processing phone numbers for ${counties.length} counties in ${nationName}.`);

            const elements = await fetchOsmDataForCounty(county);
            const { invalidNumbers, totalNumbers } = validateNumbers(elements);

            const autoFixableCount = invalidNumbers.filter(item => item.autoFixable).length;

            const stats = {
                name: county.name,
                invalidCount: invalidNumbers.length,
                autoFixableCount: autoFixableCount,
                totalNumbers: totalNumbers
            };
            
            countyStats.push(stats);
            groupedCountyStats[nationName].push(stats);
            
            totalInvalidCount += invalidNumbers.length;
            totalAutofixableCount += autoFixableCount;
            totalTotalNumbers += totalNumbers;

            generateHtmlReport(county, invalidNumbers, totalNumbers, dataTimestamp);
            // Testing - only do one from each to quickly check it's working for now
            break
        }
    }
    
    generateIndexHtml(groupedCountyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers, dataTimestamp);

    console.log('Full build process completed successfully.');
}

main();
