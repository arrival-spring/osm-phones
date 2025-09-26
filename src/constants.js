const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const COUNTRIES = {
    'United Kingdom': {
        name: 'United Kingdom',
        divisions: {
            'England': 3600058447,
            'Scotland': 3600058446,
            'Wales': 3600058437,
            'Northern Ireland': 3600156393
        },
        countryCode: 'GB',
        locale: 'en-GB'
    },
    'South Africa': {
        name: 'South Africa',
        divisions: {
            'Eastern Cape': 3604782250,
            'Free State': 3600092417,
            'Gauteng': 3600349344,
            'KwaZulu-Natal': 3600349390,
            'Limpopo': 3600349547,
            'Mpumalanga': 3600349556,
            'North West': 3600349519,
            'Northern Cape': 3600086720,
            'Western Cape': 3600080501,
        },
        countryCode: 'ZA',
        locale: 'en-ZA'
    }
};

module.exports = {
    PUBLIC_DIR,
    OVERPASS_API_URL,
    COUNTRIES
};
