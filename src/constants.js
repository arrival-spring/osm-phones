const path = require('path');
const { translate } = require('./i18n');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const PHONE_TAGS = ['phone', 'contact:phone', 'mobile', 'contact:mobile'];
const WEBSITE_TAGS = ['website', 'contact:website'];

// To add a country, provide name, countryCode, locale
// Then either divisions and subdivisionAdminLevel
// divisions is a map of names to relation ids
// This fetches all admin_level within each subdivision
// See Belgium and France for 1 and 2 level examples
//
// OR divisionMap, see United Kingdom
// this provides the subdivisions already, so they are
// not fetched automatically but are hardcoded here
// each division has a map of subdivision names to relation ids
const COUNTRIES = {
    'Belgium': {
        name: 'België / Belgique / Belgien',
        divisions: { // Only one level of divisions, we still need to provide a map here
            'Belgium': 937244,
        },
        countryCode: 'BE',
        locale: 'en', // I had to pick something. It would be possible to do a code refactor to allow the user to switch languages dynamically
        subdivisionAdminLevel: 4
    },
    'France': {
        name: 'France',
        divisions: {
            'Auvergne-Rhône-Alpes': 3792877,
            'Bourgogne – Franche-Comté': 3792878,
            'Brittany': 102740,
            'Centre-Val de Loire': 8640,
            'Corsica': 76910,
            'Grand Est': 3792876,
            'Hauts-de-France': 4217435,
            'Ile-de-France': 8649,
            'Normandy': 3793170,
            'Nouvelle-Aquitaine': 3792880,
            'Occitania': 3792883,
            'Pays de la Loire': 8650,
            "Provence-Alpes-Côte d'Azur": 8654,
        },
        countryCode: 'FR',
        locale: 'fr-FR',
        subdivisionAdminLevel: 6
    },
    'Italy': {
        name: 'Italia',
        divisions: {
            "Centro": 17518200,
            "Isole": 17514223,
            "Nord-Est": 17518337,
            "Nord-Ovest": 17518295,
            "Sud": 17514288
        },
        countryCode: 'IT',
        locale: 'it-IT',
        subdivisionAdminLevel: 4
    },
    // 'Lesotho': {
    //     name: 'Lesotho',
    //     divisions: {
    //         'Lesotho': 2093234,
    //     },
    //     countryCode: 'LS',
    //     locale: 'en-ZA',
    //     subdivisionAdminLevel: 5
    // },
    'Netherlands': {
        name: 'Nederland',
        divisions: {
            "Drenthe": 47540,
            "Flevoland": 47407,
            "Frisia": 47381,
            "Gelderland": 47554,
            "Groningen": 47826,
            "Limburg": 47793,
            "North Brabant": 47696,
            "North Holland": 47654,
            "Overijssel": 47608,
            "South Holland": 47772,
            "Utrecht": 47667,
            "Zeeland": 47806
        },
        countryCode: 'NL',
        locale: 'nl-NL',
        subdivisionAdminLevel: 8
    },
    'South Africa': {
        name: 'South Africa',
        divisions: {
            'Eastern Cape': 4782250,
            'Free State': 92417,
            'Gauteng': 349344,
            'KwaZulu-Natal': 349390,
            'Limpopo': 349547,
            'Mpumalanga': 349556,
            'North West': 349519,
            'Northern Cape': 86720,
            'Western Cape': 80501,
        },
        countryCode: 'ZA',
        locale: 'en-ZA',
        subdivisionAdminLevel: 6
    },
    'United Kingdom': {
        name: 'United Kingdom',
        divisionMap: {
            'England': {
                'Bath and North East Somerset': 81941,
                'Bedford': 158396,
                'Blackburn with Darwen': 148780,
                'Blackpool': 148603,
                'Bournemouth, Christchurch and Poole': 9448448,
                'Bracknell Forest': 113682,
                'Brighton and Hove': 114085,
                'Buckinghamshire': 10947197,
                'Cambridgeshire and Peterborough': 14209220,
                'Central Bedfordshire': 161643,
                'Cheshire East': 153487,
                'Cheshire West and Chester': 153488,
                'City of Bristol': 57539,
                'City of Leicester': 162353,
                'City of Milton Keynes': 172504,
                'City of Nottingham': 123292,
                'Cornwall': 57537,
                'County Durham': 88067,
                'Cumberland': 15684264,
                'Derby': 142308,
                'Derbyshire': 195384,
                'Devon': 190380,
                'Dorset': 9448449,
                'East Sussex': 92650,
                'Essex': 180904,
                'Gloucestershire': 85103,
                'Greater London': 175342,
                'Greater Manchester': 88084,
                'Hampshire': 172799,
                'Hartlepool': 153375,
                'Herefordshire': 10187,
                'Hertfordshire': 57032,
                'Hull and East Yorkshire': 19053688,
                'Isle of Wight': 154350,
                'Isles of Scilly': 158039,
                'Kent': 172385,
                'Lancashire': 88081,
                'Leicestershire': 189890,
                'Lincolnshire': 78312,
                'Liverpool City Region': 14210056,
                'Luton': 158392,
                'Medway': 158019,
                'Norfolk': 57397,
                'North East Lincolnshire': 69361,
                'North Lincolnshire': 107240,
                'North Northamptonshire': 10792352,
                'North Somerset': 80277,
                'Northumberland': 88066,
                'Nottinghamshire': 181040,
                'Oxfordshire': 76155,
                'Plymouth': 189924,
                'Portsmouth': 127167,
                'Reading': 115074,
                'Rutland': 57398,
                'Shropshire': 167060,
                'Slough': 117097,
                'Somerset': 72894,
                'South Gloucestershire': 82631,
                'South Yorkshire': 14212101,
                'Southampton': 127864,
                'Southend-on-Sea': 76489,
                'Staffordshire': 195444,
                'Stoke-on-Trent': 163183,
                'Suffolk': 28595,
                'Surrey': 57582,
                'Swindon': 110212,
                'Tees Valley': 14209938,
                'Telford and Wrekin': 167058,
                'Thurrock': 76521,
                'Torbay': 161649,
                'Tyne and Wear': 154376,
                'Warrington': 147278,
                'Warwickshire': 57516,
                'West Berkshire': 116938,
                'West Midlands': 6965187,
                'West Northamptonshire': 10792351,
                'West Sussex': 113757,
                'West Yorkshire': 14212258,
                'Westmorland and Furness': 15684265,
                'Wiltshire': 57533,
                'Windsor and Maidenhead': 111014,
                'Wokingham': 114311,
                'Worcestershire': 57581,
                'York and North Yorkshire': 18169929,
            },
            'Northern Ireland': {
                'County Borough of Londonderry': 16303099,
                'County Tyrone': 1117773,
                'County Fermanagh': 1118085,
                'County Down': 1119533,
                'County Antrim': 1119534,
                'County Armagh': 1119535,
            },
            'Scotland': {
                'Aberdeen City': 1900654,
                'Aberdeenshire': 1900655,
                'Angus': 1921172,
                'Argyll and Bute': 1775685,
                'City of Edinburgh': 1920901,
                'Clackmannanshire': 1920841,
                'Dumfries and Galloway': 1877232,
                'Dundee City': 1921173,
                'East Ayrshire': 1920348,
                'East Dunbartonshire': 1920660,
                'East Lothian': 1920902,
                'East Renfrewshire': 1921238,
                'Falkirk': 1920842,
                'Fife': 1905841,
                'Glasgow City': 1906767,
                'Highland': 1433249,
                'Inverclyde': 1921239,
                'Midlothian': 1920903,
                'Moray': 1775792,
                'Na h-Eileanan Siar': 1959008,
                'North Ayrshire': 1910014,
                'North Lanarkshire': 1920584,
                'Orkney Islands': 375982,
                'Perth and Kinross': 1915429,
                'Renfrewshire': 1921240,
                'Scottish Borders': 1919950,
                'Shetland Islands': 2235077,
                'South Ayrshire': 1920349,
                'South Lanarkshire': 1921241,
                'Stirling': 1905258,
                'West Dunbartonshire': 1920242,
                'West Lothian': 1910704,
            },
            'Wales': {
                'Blaenau Gwent': 2750598,
                'Bridgend': 99774,
                'Caerphilly': 2750677,
                'Cardiff': 1625787,
                'Ceredigion': 77904,
                'Conwy': 297287,
                'Denbighshire': 192442,
                'Flintshire': 198566,
                'Gwynedd': 297286,
                'Merthyr Tydfil': 2750939,
                'Monmouthshire': 358021,
                'Neath Port Talbot': 89846,
                'Newport': 335184,
                'Pembrokeshire': 57535,
                'Powys': 134324,
                'Rhondda Cynon Taf': 2751428,
                'Sir Gaerfyrddin / Carmarthenshire': 57534,
                'Swansea': 87944,
                'Torfaen': 2750460,
                'Vale of Glamorgan': 103776,
                'Wrexham': 137981,
                'Ynys Môn / Isle of Anglesey': 298793,
            }
        },
        countryCode: 'GB',
        locale: 'en-GB',
    },
};

// Order matters: first found one is preferred
// These are only used if the element has no name
const FEATURE_TAGS = [
    'amenity', 'shop', 'tourism', 'leisure', 'emergency', 'building',
    'craft', 'aeroway', 'railway', 'healthcare', 'highway', 'military',
    'man_made', 'public_transport', 'landuse', 'barrier', 'historic'
];

const HISTORIC_AND_DISUSED_PREFIXES = [
    'disused', 'historic', 'was', 'abandoned'
]

const OSM_EDITORS = {
    "JOSM": {
        getEditLink: (item) => {
            const baseUrl = 'http://127.0.0.1:8111/load_object';
            // Use item.type[0] for the single-letter type prefix (n/w/r)
            return `${baseUrl}?objects=${item.type[0]}${item.id}`;
        },
        editInString: (locale) => translate('editIn', locale, ["JOSM"]),
        onClick: (editorId) => `fixWithJosm(OSM_EDITORS['${editorId}'].getEditLink(item), event)`
    },
    "iD": {
        getEditLink: (item) => {
            const baseUrl = 'https://www.openstreetmap.org/edit?editor=id';
            return `${baseUrl}&${item.type}=${item.id}#map=19/${item.lat}/${item.lon}`;
        },
        editInString: (locale) => translate('editIn', locale, ["iD"]),
    },
    "Rapid": {
        getEditLink: (item) => {
            const baseUrl = 'https://rapideditor.org/edit#map=19';
            // Use item.type[0] for the object type prefix (n/w/r)
            return `${baseUrl}/${item.lat}/${item.lon}&id=${item.type[0]}${item.id}`;
        },
        editInString: (locale) => translate('editIn', locale, ["Rapid"]),
    },
    "Level0": {
        getEditLink: (item) => {
            const baseUrl = 'https://level0.osmz.ru/?url=';
            return `${baseUrl}${item.type}/${item.id}`;
        },
        editInString: (locale) => translate('editIn', locale, ["Level0"]),
    },
    "Geo": {
        getEditLink: (item) => {
            const baseUrl = 'geo:';
            return `${baseUrl}${item.lat},${item.lon}`;
        },
        editInString: (locale) => translate('openLocation', locale),
    },
};

const ALL_EDITOR_IDS = Object.keys(OSM_EDITORS);

const DEFAULT_EDITORS_DESKTOP = ["iD", "JOSM"];
const DEFAULT_EDITORS_MOBILE = ["Geo", "Level0"];

const EXCLUSIONS = {
    'FR': { // France
        '3631': { // The phone number to check (must be the core number, no country code or spaces)
            'amenity': 'post_office',
        },
    },
};

// Define the regex for separators that are definitively "bad" and should trigger a fix report.
const BAD_SEPARATOR_REGEX = /(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

// This regex is used for splitting by data-processor.js. It catches ALL valid and invalid separators:
// Raw semicolon (';'), semicolon with optional space ('; ?'), comma, slash, 'or' or 'and'.
const UNIVERSAL_SPLIT_REGEX = /(?:; ?)|(?:\s*,\s*)|(?:\s*\/\s*)|(?:\s+or\s+)|(?:\s+and\s+)/gi;

// When used in diff, the groups need to be capturing
const UNIVERSAL_SPLIT_CAPTURE_REGEX = /(; ?)|(\s*,\s*)|(\s*\/\s*)|(\s+or\s+)|(\s+and\s+)/gi;

const ICON_PACKS = {
    'roentgen': {
        owner: 'enzet',
        repo: 'Roentgen',
        folder_path: 'icons',
        output_sub_dir: 'roentgen'
    },
    'iD-preset': {
        owner: 'openstreetmap',
        repo: 'iD',
        folder_path: 'svg/iD-sprite/presets',
        output_sub_dir: 'iD'
    },
    'iD-icon': {
        owner: 'openstreetmap',
        repo: 'iD',
        folder_path: 'svg/iD-sprite/icons',
        output_sub_dir: 'iD' // same as presets, shouldn't be any filename clashes though
    }
}

const ICONS_DIR = path.join(__dirname, '..', 'build-assets', 'icons');
const GITHUB_API_BASE_URL = 'https://api.github.com/repos/';


module.exports = {
    PUBLIC_DIR,
    OVERPASS_API_URL,
    PHONE_TAGS,
    WEBSITE_TAGS,
    COUNTRIES,
    FEATURE_TAGS,
    HISTORIC_AND_DISUSED_PREFIXES,
    OSM_EDITORS,
    ALL_EDITOR_IDS,
    DEFAULT_EDITORS_DESKTOP,
    DEFAULT_EDITORS_MOBILE,
    EXCLUSIONS,
    BAD_SEPARATOR_REGEX,
    UNIVERSAL_SPLIT_REGEX,
    UNIVERSAL_SPLIT_CAPTURE_REGEX,
    ICONS_DIR,
    GITHUB_API_BASE_URL,
    ICON_PACKS
};
