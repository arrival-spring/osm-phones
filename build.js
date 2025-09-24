const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

async function fetchCountiesGB() {
    // Testing
    // const testCounties = {'Bedfordshire and Hertfordshire': 17623586, 'East Yorkshire and Northern Lincolnshire': 17623573, 'Devon': 17618825}

    // // Convert the object into the expected array format
    // return Object.entries(testCounties).map(([name, id]) => ({
    //     name: name,
    //     id: id
    // }));

    console.log('Fetching all counties for Great Britain...');
    const { default: fetch } = await import('node-fetch');

    const queryTimeout = 180;
    
    // This query fetches all administrative level 6 relations within the UK
    // It is a small, fast query that is unlikely to time out
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

function getFeatureHeading(item) {
    if (item.name) {
        return `<h3>${item.name}</h3>`;
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
        return `<h3>${formattedType}</h3>`;
    } else {
        const formattedType = item.type.replace(/\b\w/g, c => c.toUpperCase());
        return `<h3>OSM ${formattedType}</h3>`;
    }
}

function generateHtmlReport(county, invalidNumbers) {
    const autofixableNumbers = invalidNumbers.filter(item => item.autoFixable);
    const manualFixNumbers = invalidNumbers.filter(item => !item.autoFixable);

    let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Phone Numbers in ${county.name}</title>
          <style>
            body { font-family: sans-serif; line-height: 1.6; padding: 20px; }
            h1 { text-align: center; }
            h2 { margin-top: 2em; }
            .number-info { font-weight: bold; }
            .error { color: red; font-size: 0.9em; }
            .fix-buttons a { margin-right: 10px; }
            .fix-container { margin-top: 5px; }
            ul { list-style-type: none; padding: 0; }
            li { background: #f4f4f4; margin: 10px auto; padding: 10px; border-radius: 5px; position: relative; max-width: 600px; }
            .website-link { position: absolute; top: 10px; right: 10px; font-size: 0.9em; }
          </style>
        </head>
        <body>
          <h1>Invalid UK Phone Numbers in ${county.name}</h1>
          <p><a href="index.html">← Back to main index</a></p>
          <p>This report identifies phone numbers in OpenStreetMap that are invalid in ${county.name}.</p>
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
      `;
  
      if (autofixableNumbers.length > 0) {
        htmlContent += `<h2>Autofixable Numbers</h2>`;
        htmlContent += `<p>These numbers appear to be valid UK numbers but are formatted incorrectly. The suggested fix assumes that they are indeed UK numbers. Not all 'auto' fixes are necessarily valid, so please do not blindly click on all the fix links without first verifying the number.</p><ul>`;
        autofixableNumbers.forEach(item => {
          const idLink = `https://www.openstreetmap.org/edit?editor=id&map=19/${item.lat}/${item.lon}&${item.type}=${item.id}`;
          const josmLink = `http://localhost:8111/load_object?objects=${item.type}${item.id}&zoom=19`;
          const josmFixLink = `http://localhost:8111/load_object?objects=${item.type}${item.id}&addtags=${item.tag}=${encodeURIComponent(item.suggestedFixes.join('; '))}`;

          let websiteHtml = '';
          if (item.website) {
              websiteHtml = `<span class="website-link"><a href="${item.website}" target="_blank">Website</a></span>`;
          }

          htmlContent += `
            <li>
              ${getFeatureHeading(item)}
              ${websiteHtml}
              <div class="fix-buttons">
                <a href="${idLink}" target="_blank">Edit in iD</a>
                <a href="${josmLink}" target="_blank">Open in JOSM</a>
                <a href="#" onclick="fixWithJosm('${josmFixLink}', event)">Fix with JOSM</a>
              </div>
              <span class="number-info">Invalid Number(s):</span> ${item.invalidNumbers.join('; ')}<br>
              <span class="number-info">Suggested Fix(es):</span> ${item.suggestedFixes.join('; ')}<br>
              <span class="number-info">OSM ID:</span> <a href="${item.osmUrl}" target="_blank">${item.type}/${item.id}</a><br>
            </li>
          `;
        });
        htmlContent += `</ul>`;
      }

      if (manualFixNumbers.length > 0) {
        htmlContent += `<h2>Manual Fixes</h2>`;
        htmlContent += `<p>These numbers are all invalid in some way; maybe they are too long or too short, or perhaps they're missing an area code. The website could be used to check for a valid number, or a survey may be necessary.</p><ul>`;
        manualFixNumbers.forEach(item => {
          const idLink = `https://www.openstreetmap.org/edit?editor=id&map=19/${item.lat}/${item.lon}&${item.type}=${item.id}`;
          const josmLink = `http://localhost:8111/load_object?objects=${item.type}${item.id}&zoom=19`;

          let websiteHtml = '';
          if (item.website) {
              websiteHtml = `<span class="website-link"><a href="${item.website}" target="_blank">Website</a></span>`;
          }

          htmlContent += `
            <li>
              ${getFeatureHeading(item)}
              ${websiteHtml}
              <div class="fix-buttons">
                <a href="${idLink}" target="_blank">Edit in iD</a>
                <a href="${josmLink}" target="_blank">Open in JOSM</a>
              </div>
              <span class="number-info">Invalid Number(s):</span> ${item.invalidNumbers.join('; ')}<br>
              <span class="number-info">OSM ID:</span> <a href="${item.osmUrl}" target="_blank">${item.type}/${item.id}</a><br>
              ${item.error ? `<span class="error">Error:</span> ${item.error}` : ''}
            </li>
          `;
        });
        htmlContent += `</ul>`;
      }
      
      if (invalidNumbers.length === 0) {
        htmlContent += '<ul><li>No invalid phone numbers found! 🎉</li></ul>';
      }
  
      htmlContent += `
        </body>
        </html>
      `;
    
    const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
    const fileName = `${safeCountyName}.html`;

    fs.writeFileSync(path.join(PUBLIC_DIR, fileName), htmlContent);
    console.log(`Report for ${county.name} saved to ${fileName}.`);
}

function getBackgroundColor(percent) {
  if (percent < 98) {
    // Red for anything below 98%
    return `hsl(0, 70%, 75%)`;
  }
  // Scale green from 98% to 100%
  const hue = ((percent - 98) / 2) * 120;
  return `hsl(${hue}, 70%, 75%)`;
}

function generateIndexHtml(countyStats, totalInvalidCount, totalAutofixableCount, totalTotalNumbers) {
    const sortedCounties = [...countyStats].sort((a, b) => a.name.localeCompare(b.name));
    
    const totalValidCount = totalTotalNumbers - totalInvalidCount;
    const totalValidPercentage = totalTotalNumbers > 0 ? (totalValidCount / totalTotalNumbers) * 100 : 100;
    
    let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid UK Phone Numbers in OpenStreetMap</title>
          <style>
              body { font-family: sans-serif; line-height: 1.6; padding: 20px; }
              h1 { text-align: center; }
              .summary {
                  text-align: center;
                  font-size: 1.2em;
                  margin-bottom: 2em;
                  padding: 15px;
                  background: #e9ecef;
                  border-radius: 8px;
              }
              ul { list-style-type: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
              li { padding: 0; border-radius: 5px; }
              li a {
                  display: block;
                  padding: 10px;
                  text-decoration: none;
                  color: inherit;
                  font-weight: bold;
                  transition: background-color 0.3s ease;
              }
              li a:hover {
                  background-color: rgba(0,0,0,0.1);
                  text-decoration: underline;
              }
          </style>
        </head>
        <body>
          <h1>Invalid UK Phone Numbers in OpenStreetMap</h1>
          <div class="summary">
            <p>Overall Summary</p>
            <p><strong>Total Phone Numbers:</strong> ${totalTotalNumbers}</p>
            <p><strong>Invalid Numbers:</strong> ${totalInvalidCount} (${totalValidPercentage.toFixed(2)}% valid)</p>
            <p><strong>Autofixable Numbers:</strong> ${totalAutofixableCount}</p>
          </div>
          <p>This site provides a breakdown of invalid UK phone numbers found in OpenStreetMap, separated by county.</p>
          <ul>
      `;
  
      sortedCounties.forEach(county => {
          const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
          const fileName = `${safeCountyName}.html`;
          
          let statsHtml = '';
          const validPercentage = (county.totalNumbers > 0) ? ((county.totalNumbers - county.invalidCount) / county.totalNumbers) * 100 : 100;
          const backgroundColor = getBackgroundColor(validPercentage);

          if (county.totalNumbers > 0) {
              statsHtml = `
                <p>Found <strong>${county.invalidCount}</strong> invalid numbers (${county.autoFixableCount} autofixable) out of <strong>${county.totalNumbers}</strong> total numbers (<strong style="color: #007bff;">${validPercentage.toFixed(2)}%</strong> valid).</p>
              `;
          } else {
              statsHtml = `<p>No phone numbers found.</p>`;
          }

          htmlContent += `
            <li style="background-color: ${backgroundColor};">
              <a href="${fileName}">
                <h3 style="margin-top: 0; text-align: center;">${county.name}</h3>
                ${statsHtml}
              </a>
            </li>
          `;
      });
  
      htmlContent += `
          </ul>
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
