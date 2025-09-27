const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const COUNTRIES = {
    'Belgium': {
        name: 'Belgium',
        divisions: {
            'Belgium': 3600937244,
        },
        countryCode: 'BE',
        locale: 'fr-BE',
        subdivisionAdminLevel: 4
    },
    'France': {
        name: 'France',
        divisions: {
            'Auvergne-Rhône-Alpes': 3603792877,
            'Bourgogne – Franche-Comté': 3603792878,
            'Brittany': 3600102740,
            'Centre-Val de Loire': 3600008640,
            'Corsica': 3600076910,
            'Grand Est': 3603792876,
            'Hauts-de-France': 3604217435,
            'Ile-de-France': 3600008649,
            'Normandy': 3603793170,
            'Nouvelle-Aquitaine': 3603792880,
            'Occitania': 3603792883,
            'Pays de la Loire': 3600008650,
            "Provence-Alpes-Côte d'Azur": 3600008654,
        },
        countryCode: 'FR',
        locale: 'fr-FR',
        subdivisionAdminLevel: 6
    },
    'Italy': {
        name: 'Italy',
        divisions: {
            "Centro": 3617518200,
            "Isole": 3617514223,
            "Nord-Est": 3617518337,
            "Nord-Ovest": 3617518295,
            "Sud": 3617514288
        },
        countryCode: 'IT',
        locale: 'it-IT',
        subdivisionAdminLevel: 4
    },
    // 'Lesotho': {
    //     name: 'Lesotho',
    //     divisions: {
    //         'Lesotho': 3602093234,
    //     },
    //     countryCode: 'LS',
    //     locale: 'en-ZA',
    //     subdivisionAdminLevel: 5
    // },
    'Netherlands': {
        name: 'Netherlands',
        divisions: {
            "Drenthe": 3600047540,
            "Flevoland": 3600047407,
            "Frisia": 3600047381,
            "Gelderland": 3600047554,
            "Groningen": 3600047826,
            "Limburg": 3600047793,
            "North Brabant": 3600047696,
            "North Holland": 3600047654,
            "Overijssel": 3600047608,
            "South Holland": 3600047772,
            "Utrecht": 3600047667,
            "Zeeland": 3600047806
        },
        countryCode: 'NL',
        locale: 'nl-NL',
        subdivisionAdminLevel: 8
    },
    // 'South Africa': {
    //     name: 'South Africa',
    //     divisions: {
    //         'Eastern Cape': 3604782250,
    //         'Free State': 3600092417,
    //         'Gauteng': 3600349344,
    //         'KwaZulu-Natal': 3600349390,
    //         'Limpopo': 3600349547,
    //         'Mpumalanga': 3600349556,
    //         'North West': 3600349519,
    //         'Northern Cape': 3600086720,
    //         'Western Cape': 3600080501,
    //     },
    //     countryCode: 'ZA',
    //     locale: 'en-ZA',
    //     subdivisionAdminLevel: 6
    // },
    // 'United Kingdom': {
    //     name: 'United Kingdom',
    //     divisions: {
    //         'England': 3600058447,
    //         'Scotland': 3600058446,
    //         'Wales': 3600058437,
    //         'Northern Ireland': 3600156393
    //     },
    //     countryCode: 'GB',
    //     locale: 'en-GB',
    //     subdivisionAdminLevel: 6
    // },
};

module.exports = {
    PUBLIC_DIR,
    OVERPASS_API_URL,
    COUNTRIES
};
