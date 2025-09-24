const fs = require('fs');
const path = require('path');
const { parsePhoneNumber } = require('libphonenumber-js');

const PUBLIC_DIR = path.join(__dirname, 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

async function fetchUkCounties() {
    console.log('Fetching UK county administrative boundaries...');
    const { default: fetch } = await import('node-fetch');
    
    const query = `
        [out:json][timeout:180];
        area["ISO3166-1"="GB"][admin_level=2]->.uk;
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
        const relations = data.elements.map(el => ({
            name: el.tags.name,
            id: el.id
        }));
        console.log(`Found ${relations.length} UK counties.`);
        return relations;
    } catch (error) {
        console.error('Error fetching county data:', error);
        return [];
    }
}

async function fetchOsmDataForCounty(county) {
    console.log(`Fetching data for county: ${county.name} (ID: ${county.id})...`);
    const { default: fetch } = await import('node-fetch');

    const areaId = county.id + 3600000000;
    
    const overpassQuery = `
        [out:json][timeout:360];
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
  elements.forEach(element => {
    if (element.tags) { 
        const tags = element.tags;
        const phoneTags = ['phone', 'contact:phone'];
        for (const tag of phoneTags) {
          if (tags[tag]) {
            const numbers = tags[tag].split(';').map(s => s.trim());
            numbers.forEach(numberStr => {
              try {
                const phoneNumber = parsePhoneNumber(numberStr, 'GB');
                if (phoneNumber && !phoneNumber.isValid()) {
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
  return invalidNumbers;
}

function generateHtmlReport(countyName, invalidNumbers) {
    let htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Invalid Phone Numbers in ${countyName}</title>
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
          <h1>Invalid UK Phone Numbers in ${countyName}</h1>
          <p><a href="index.html">← Back to main index</a></p>
          <p>This report identifies phone numbers in OpenStreetMap that are invalid in ${countyName}.</p>
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
    
    // Sanitize the filename to prevent errors with special characters
    const safeCountyName = countyName.replace(/\s+|\//g, '-').toLowerCase();
    const fileName = `${safeCountyName}.html`;

    fs.writeFileSync(path.join(PUBLIC_DIR, fileName), htmlContent);
    console.log(`Report for ${countyName} saved to ${fileName}.`);
}

function generateIndexHtml(countyList) {
    const sortedCounties = [...countyList].sort((a, b) => a.name.localeCompare(b.name));
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
              ul { list-style-type: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
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
          // Sanitize the filename in the index.html links as well
          const safeCountyName = county.name.replace(/\s+|\//g, '-').toLowerCase();
          const fileName = `${safeCountyName}.html`;
          htmlContent += `<li><a href="${fileName}">${county.name}</a></li>`;
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
    
    const ukCounties = await fetchUkCounties();
    
    generateIndexHtml(ukCounties);
    
    for (const county of ukCounties) {
        const elements = await fetchOsmDataForCounty(county);
        const invalidNumbers = validateNumbers(elements);
        generateHtmlReport(county.name, invalidNumbers);
    }
    
    console.log('Build process completed.');
}

main();
