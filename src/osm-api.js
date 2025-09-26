const { OVERPASS_API_URL } = require('./constants');

/**
 * Recursive unction to fetch admin_level=6 subdivisions from Overpass API.
 * @param {number} divisionAreaId - The area ID for the subdivision.
 * @param {string} divisionName - The name of the division (for logging).
 * @param {number} retries - Number of retries left.
 * @returns {Promise<Array<{name: string, id: number}>>}
 */
async function fetchAdminLevels(divisionAreaId, divisionName, admin_level, retries = 3) {
    console.log(`Fetching all subdivisions for ${divisionName}...`);
    const { default: fetch } = await import('node-fetch');

    const queryTimeout = 180;

    const query = `
        [out:json][timeout:${queryTimeout}];
        area(${divisionAreaId})->.division;
        rel(area.division)["admin_level"="${admin_level}"]["name"];
        out body;
    `;

    try {
        const response = await fetch(OVERPASS_API_URL, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        if (response.status === 429 || response.status === 504) {
            if (retries > 0) {
                const retryAfter = response.headers.get('Retry-After') || 60;
                console.warn(`Overpass API rate limit or gateway timeout hit (error ${response.status}). Retrying in ${retryAfter} seconds... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return fetchAdminLevels(divisionAreaId, divisionName, admin_level, retries - 1);
            } else {
                throw new Error(`Overpass API response error: ${response.statusText}`);
            }
        }

        if (!response.ok) {
            throw new Error(`Overpass API response error: ${response.statusText}`);
        }

        const data = await response.json();
        const subdivisions = data.elements.map(el => ({
            name: el.tags.name,
            id: el.id
        }));

        const uniqueSubdivisions = [...new Map(subdivisions.map(item => [item.name, item])).values()];
        return uniqueSubdivisions;
    } catch (error) {
        console.error(`Error fetching subdivisions for ${divisionName}:`, error);
        return [];
    }
}

/**
 * Recursive function to fetch OSM elements with phone tags for a specific division.
 * @param {{name: string, id: number}} division - The division object.
 * @param {number} retries - Number of retries left.
 * @returns {Promise<Array<Object>>}
 */
async function fetchOsmDataForDivision(division, retries = 3) {
    console.log(`Fetching data for division: ${division.name} (ID: ${division.id})...`);
    const { default: fetch } = await import('node-fetch');

    const areaId = division.id + 3600000000;
    const queryTimeout = 600;

    const overpassQuery = `
        [out:json][timeout:${queryTimeout}];
        area(${areaId})->.division;
        (
          nwr(area.division)["phone"~".*"];
          nwr(area.division)["contact:phone"~".*"];
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
                console.warn(`Overpass API rate limit or gateway timeout hit (error ${response.status}). Retrying in ${retryAfter} seconds... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                return await fetchOsmDataForDivision(division, retries - 1);
            }
        }

        if (!response.ok) {
            throw new Error(`Overpass API response error: ${response.statusText}`);
        }
        const data = await response.json();
        return data.elements;
    } catch (error) {
        console.error(`Error fetching OSM data for ${division.name}:`, error);
        return [];
    }
}

module.exports = {
    fetchAdminLevels: fetchAdminLevels,
    fetchOsmDataForDivision,
};
