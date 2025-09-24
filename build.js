const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

// Use the pre-calculated area IDs for England, Scotland, and Wales
const ukRegions = [
    //{ name: 'England', id: 3600062142 },
    { name: 'Scotland', id: 3600062143 },
    //{ name: 'Wales', id: 3600062144 }
];

async function fetchCountiesByRegion(region) {
    console.log(`Fetching counties for ${region.name}...`);
    const { default: fetch } = await import('node-fetch');

    // The Overpass API timeout for this request.
    const queryTimeout = 180;
    
    // Query for all relations tagged as admin_level=6 (county) within the region's area.
    const query = `
        [out:json][timeout:${queryTimeout}];
        area(${region.id})->.region;
        rel(area.region)["admin_level"="6"]["name"];
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
        console.error(`Error fetching county data for ${region.name}:`, error);
        return [];
    }
}

async function fetchOsmDataForCounty(county, retries = 3) {
    console.log(`Fetching data for county: ${county.name} (ID: ${county.id})...`);
    const { default: fetch } = await import('node-fetch');

    const areaId = county.id + 3600000000;
    const queryTimeout = 600; // Increased timeout for larger queries
    
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
        
        if (response.status === 429 || response.status === 504) { // 429: Too Many Requests, 504: Gateway Timeout
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
    
    const allCounties = [];
    for (const region of ukRegions) {
        const counties = await fetchCountiesByRegion(region);
        allCounties.push(...counties);
    }
    
    // We'll use this array to build the index page
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

    console.log('Build process completed.');
}

main();
