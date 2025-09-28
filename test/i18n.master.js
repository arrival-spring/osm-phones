const MASTER_KEYS = {
    // --- Basic Keys (No Placeholders Required) ---
    'numbersChecked': [],
    'invalidNumbers': [],
    'potentiallyFixable': [],
    'calculating': [],
    'suggestionIssueLink': [],
    'letMeKnowOnGitHub': [],
    'openLocation': [],
    'fixInJOSM': [],
    'website': [],
    'suggestedFix': [],
    'phone': [],
    'backToCountryPage': [],
    'phoneNumberReport': [],
    'fixableNumbersHeader': [],
    'invalidNumbersHeader': [],
    'invalid': [],
    'osmPhoneNumberValidation': [],
    'reportSubtitle': [],
    'countryReports': [],
    'backToAllCountries': [],
    'divisionalReports': [],
    'hideEmptyDivisions': [],
    'sortBy': [],
    'invalidPercentage': [],
    'invalidCount': [],
    'name': [],
    'noDivisionsFound': [],
    'noAutoFixable': [],
    'noInvalidNumbers': [],
    'timeAgoJustNow': [],
    'timeAgoError': [],
    'settings': [],

    'fixableNumbersDescription': [],
    'invalidNumbersDescription': [],

    // --- Keys with Required Placeholders ---
    'editIn': ['%e'],

    'invalidPercentageOfTotal': ['%p'],
    'fixablePercentageOfInvalid': ['%p'],

    'invalidNumbersOutOf': ['%i', '%f', '%t'],

    'reportSubtitleForCountry': ['%c'],
    'dataSourcedTemplate': ['%d', '%t', '%z', '%a'],

    // Time Ago (uses %n for number)
    'timeAgoMinute': ['%n'],
    'timeAgoMinutesPlural': ['%n'],
    'timeAgoHour': ['%n'],
    'timeAgoHoursPlural': ['%n'],

    // Page Titles (uses %s for country name)
    'mainIndexTitle': [], // Static title
    'countryReportTitle': ['%c']
};

module.exports = { MASTER_KEYS };