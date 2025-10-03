const fs = require('fs');
const path = require('path');

const presetsData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'node_modules/@openstreetmap/id-tagging-schema/dist/presets.json'), 'utf8'));
const enTranslations = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'node_modules/@openstreetmap/id-tagging-schema/dist/translations/en.json'), 'utf8')).en;

const allPresets = {};
for (const key in presetsData) {
    allPresets[key] = { ...presetsData[key], id: key };
}

// A simple way to determine geometry for an OSM item
function getGeometry(item) {
    if (item.type === 'node') return 'point';
    if (item.type === 'relation') return 'relation';

    // For ways, determine if it's an area or line
    if (item.allTags.area === 'yes') return 'area';
    if (item.allTags.area === 'no') return 'line';

    const areaKeys = ['building', 'landuse', 'natural', 'leisure', 'amenity', 'shop', 'tourism', 'historic'];
    for (const key of areaKeys) {
        if (item.allTags[key]) {
            return 'area';
        }
    }

    return 'line';
}

function getMatchScore(preset, tags, geometry) {
    // Check geometry compatibility
    if (preset.geometry && !preset.geometry.includes(geometry)) {
        return -1;
    }

    let score = preset.matchScore || 0;
    let specificMatches = 0;

    for (const key in preset.tags) {
        const value = preset.tags[key];
        if (!tags.hasOwnProperty(key)) {
            return -1; // A required tag is missing
        }
        if (value === '*') {
            // Wildcard match
        } else if (value === tags[key]) {
            specificMatches++;
        } else {
            return -1; // Tag value doesn't match
        }
    }

    return score + specificMatches;
}

function getBestPreset(item) {
    const geometry = getGeometry(item);
    let bestPreset = null;
    let maxScore = -1;

    for (const id in allPresets) {
        const preset = allPresets[id];

        const score = getMatchScore(preset, item.allTags, geometry);
        if (score > maxScore) {
            maxScore = score;
            bestPreset = preset;
        }
    }

    if (bestPreset) {
        // Create a copy to avoid modifying the original preset object
        const presetCopy = { ...bestPreset };

        // Get translated name
        if (enTranslations && enTranslations.presets && enTranslations.presets.presets && enTranslations.presets.presets[presetCopy.id]) {
            presetCopy.name = enTranslations.presets.presets[presetCopy.id].name;
        } else {
             // Fallback name if translation not found
            const nameParts = presetCopy.id.split('/');
            const fallbackName = nameParts[nameParts.length - 1];
            presetCopy.name = fallbackName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return presetCopy;
    }

    return null;
}

module.exports = {
    getBestPreset
};