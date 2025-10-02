const fs = require('fs');
const path = require('path');

const presets = JSON.parse(fs.readFileSync(path.join(__dirname, '../node_modules/@openstreetmap/id-tagging-schema/dist/presets.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../node_modules/@openstreetmap/id-tagging-schema/dist/translations/en.json'), 'utf8'));

const presetCache = new Map();
const presetKeyMapping = new Map();

for (const key in presets) {
    const preset = presets[key];
    presetKeyMapping.set(preset, key);
    if (preset.tags) {
        for (const tagKey in preset.tags) {
            if (preset.tags[tagKey] === '*') {
                if (!presetCache.has(tagKey)) {
                    presetCache.set(tagKey, []);
                }
                presetCache.get(tagKey).push(preset);
            }
        }
    }
}

function getBestPreset(item) {
    let bestPreset = null;
    let maxScore = -1;

    for (const tagKey in item.allTags) {
        if (presetCache.has(tagKey)) {
            const potentialPresets = presetCache.get(tagKey);
            for (const preset of potentialPresets) {
                let score = preset.matchScore || 0;
                let allTagsMatch = true;

                for (const pTagKey in preset.tags) {
                    if (preset.tags[pTagKey] !== '*' && item.allTags[pTagKey] !== preset.tags[pTagKey]) {
                        allTagsMatch = false;
                        break;
                    }
                }

                if (allTagsMatch && score > maxScore) {
                    bestPreset = preset;
                    maxScore = score;
                }
            }
        }
    }

    if (bestPreset) {
        const presetKey = presetKeyMapping.get(bestPreset);
        const presetCopy = { ...bestPreset };

        if (en && en.presets && en.presets.presets && en.presets.presets[presetKey]) {
            presetCopy.name = en.presets.presets[presetKey].name;
        } else {
             // fallback name if translation not found
            presetCopy.name = presetKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return presetCopy;
    }

    return null;
}

module.exports = {
    getBestPreset
};