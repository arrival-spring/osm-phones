const fs = require('fs');
const path = require('path');

const presetsData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'node_modules/@openstreetmap/id-tagging-schema/dist/presets.json'), 'utf8'));

const allPresets = {};
for (const key in presetsData) {
    allPresets[key] = { ...presetsData[key], id: key };
}

const translations = {};

function loadTranslation(locale) {
    if (translations[locale]) {
        return translations[locale];
    }

    const lang = locale.split('-')[0];
    let translation;

    // Try full locale, then language, then fallback to english
    const translationPaths = [
        path.resolve(__dirname, '..', `node_modules/@openstreetmap/id-tagging-schema/dist/translations/${locale}.json`),
        path.resolve(__dirname, '..', `node_modules/@openstreetmap/id-tagging-schema/dist/translations/${lang}.json`),
        path.resolve(__dirname, '..', `node_modules/@openstreetmap/id-tagging-schema/dist/translations/en.json`)
    ];

    for (const p of translationPaths) {
        if (fs.existsSync(p)) {
            const translationData = JSON.parse(fs.readFileSync(p, 'utf8'));
            translation = translationData[locale] || translationData[lang] || translationData.en;
            if (translation) break;
        }
    }

    if (translation) {
        translations[locale] = translation;
        return translation;
    }

    return null;
}

// Preload 'en'
loadTranslation('en');

// A simple way to determine geometry for an OSM item
function getGeometry(item) {
    if (item.type === 'node') return 'point';

    // For ways and relations, determine if it's an area
    if (item.allTags.area === 'yes') return 'area';
    if (item.allTags.area === 'no') return 'line';

    const areaKeys = ['building', 'landuse', 'natural', 'leisure', 'amenity', 'shop', 'tourism', 'historic'];
    for (const key of areaKeys) {
        if (item.allTags[key]) {
            return 'area';
        }
    }

    // Relations can be areas, so only check this after checking for area
    if (item.type === 'relation') return 'relation';

    // Not a relation or an area
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

function getBestPreset(item, locale = 'en') {
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
        const translation = loadTranslation(locale) || loadTranslation('en');

        if (translation && translation.presets && translation.presets.presets && translation.presets.presets[presetCopy.id]) {
            presetCopy.name = translation.presets.presets[presetCopy.id].name;
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
    getBestPreset,
    getGeometry
};