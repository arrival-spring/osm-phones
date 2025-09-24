const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// Use a static list of UK counties to ensure the build process always has data to work with.
const ukCounties = [
    { name: 'Bedfordshire', id: 3601550993 },
    { name: 'Berkshire', id: 3601550992 },
    { name: 'Buckinghamshire', id: 3601550991 },
    { name: 'Cambridgeshire', id: 3601550990 },
    { name: 'Cheshire', id: 3600062409 },
    { name: 'Cornwall', id: 3601550989 },
    { name: 'Cumbria', id: 3600062411 },
    { name: 'Derbyshire', id: 3600062412 },
    { name: 'Devon', id: 3601550988 },
    { name: 'Dorset', id: 3601550987 },
    { name: 'Durham', id: 3600062413 },
    { name: 'East Sussex', id: 3601550986 },
    { name: 'Essex', id: 3601550985 },
    { name: 'Gloucestershire', id: 3601550984 },
    { name: 'Hampshire', id: 3601550983 },
    { name: 'Hertfordshire', id: 3601550982 },
    { name: 'Kent', id: 3601550981 },
    { name: 'Lancashire', id: 3600062417 },
    { name: 'Leicestershire', id: 3601550980 },
    { name: 'Lincolnshire', id: 3600062416 },
    { name: 'Norfolk', id: 3601550979 },
    { name: 'Northamptonshire', id: 3601550978 },
    { name: 'Northumberland', id: 3600062415 },
    { name: 'Nottinghamshire', id: 3600062418 },
    { name: 'Oxfordshire', id: 3601550977 },
    { name: 'Shropshire', id: 3600062419 },
    { name: 'Somerset', id: 3601550976 },
    { name: 'Staffordshire', id: 3600062420 },
    { name: 'Suffolk', id: 3601550975 },
    { name: 'Surrey', id: 3601550974 },
    { name: 'Warwickshire', id: 3601550973 },
    { name: 'West Sussex', id: 3601550972 },
    { name: 'Wiltshire', id: 3601550971 },
    { name: 'Worcestershire', id: 3601550970 },
    { name: 'Yorkshire', id: 3601550969 },
];

async function fetchOsmDataForCounty(county, retries = 3) {
    console.log(`Fetching data for county: ${county.name} (ID: ${county.id})...`);
    const { default: fetch } = await import('node-fetch');

    const areaId = county.id;
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
        out body;
        >;
        out skel qt;
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
  const invalidNumbers = [];
  let totalNumbers = 0;

  elements.forEach(element => {
    if (element.tags) { 
        const tags = element.tags;
        const phoneTags = ['phone', 'contact:phone'];
        for (const tag of phoneTags) {
          if (tags[tag]) {
            const numbers = tags[tag].split(';').map(s => s.trim());
            numbers.forEach(numberStr => {
                totalNumbers++;
                try {
                    const phoneNumber = parsePhoneNumber(numberStr, 'GB');
                    if (!phoneNumber || !phoneNumber.isValid()) {
                      invalidNumbers.push({
                        type: element.type,
                        id: element.id,
                        number: numberStr,
                        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`
                      });
                    }
                } catch (e) {
                    invalidNumbers.push({
                      type: element.type,
                      id: element.id,
                      number: numberStr,
                      error: e.message,
                      osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`
                    });
                }
            });
          }
        }
    }
  });

  return { invalidNumbers, totalNumbers };
}

function generateHtmlReport(county, invalidNumbers) {
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
            .osm-link { float: right; font-size: 0.8em; }
            .number-info { font-weight: bold; }
            .error { color: red; font-size: 0.9em; }
            ul { list-style-type: none; padding: 0; }
            li { background: #f4f4f4; margin: 10px 0; padding: 10px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <h1>Invalid UK Phone Numbers in ${county.name}</h1>
          <p><a href="index.html">← Back to main index</a></p>
          <p>This report identifies phone numbers in OpenStreetMap that are invalid in ${county.name}.</p>
          <ul>
      `;
  
      if (invalidNumbers.length === 0) {
        htmlContent += '<li>No invalid phone numbers found! 🎉</li>';
      } else {
        invalidNumbers.forEach(item => {
          htmlContent += `
            <li>
              <a href="${item.osmUrl}" target="_blank" class="osm-link">View on OSM</a>
              <span class="number-info">Invalid Number:</span> ${item.number}<br>
              <span class="number-info">OSM ID:</span> ${item.type}/${item.id}<br>
              ${item.error ? `<span class="error">Error:</span> ${item.error}` : ''}
            </li>
          `;
        });
      }
  
      htmlContent += `
          </ul>
        </body>
        </html>
      `;
    
    const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
    const fileName = `${safeCountyName}.html`;

    fs.writeFileSync(path.join(PUBLIC_DIR, fileName), htmlContent);
    console.log(`Report for ${county.name} saved to ${fileName}.`);
}

function generateIndexHtml(countyStats) {
    const sortedCounties = [...countyStats].sort((a, b) => a.name.localeCompare(b.name));
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
              ul { list-style-type: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
              li { background: #f4f4f4; padding: 10px; border-radius: 5px; text-align: center; }
              a { text-decoration: none; color: #333; font-weight: bold; }
              a:hover { color: #000; text-decoration: underline; }
          </style>
        </head>
        <body>
          <h1>Invalid UK Phone Numbers by County</h1>
          <p>This site provides a breakdown of invalid UK phone numbers found in OpenStreetMap, separated by county.</p>
          <ul>
      `;
  
      sortedCounties.forEach(county => {
          const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
          const fileName = `${safeCountyName}.html`;
          
          let statsHtml = '';
          if (county.totalNumbers > 0) {
              const validPercentage = ((county.totalNumbers - county.invalidCount) / county.totalNumbers) * 100;
              statsHtml = `<p>Found ${county.invalidCount} invalid numbers out of ${county.totalNumbers} total numbers (${validPercentage.toFixed(2)}% valid).</p>`;
          } else {
              statsHtml = `<p>No phone numbers found.</p>`;
          }

          htmlContent += `<li><a href="${fileName}">${county.name}</a>${statsHtml}</li>`;
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
    console.log(`Processing phone numbers for ${ukCounties.length} counties.`);
    
    const countyStats = [];
    
    for (const county of ukCounties) {
        const elements = await fetchOsmDataForCounty(county);
        const { invalidNumbers, totalNumbers } = validateNumbers(elements);
        
        countyStats.push({
            name: county.name,
            invalidCount: invalidNumbers.length,
            totalNumbers: totalNumbers
        });
        
        generateHtmlReport(county, invalidNumbers);
    }
    
    generateIndexHtml(countyStats);

    console.log('Full build process completed successfully.');
}

main();
