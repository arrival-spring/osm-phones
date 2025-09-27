const MASTER_KEYS = {
    // --- Basic Keys (No Placeholders Required) ---
    'numbersChecked': [],
    'invalidNumbers': [],
    'potentiallyFixable': [],
    'calculating': [],
    'suggestionIssueLink': [],
    'letMeKnowOnGitHub': [],
    'editInID': [],
    'editInJOSM': [],
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

    'fixableNumbersDescription': [],
    'invalidNumbersDescription': [],

    // --- Keys with Required Placeholders ---
    'invalidPercentageOfTotal': ['%p'],
    'fixablePercentageOfInvalid': ['%p'],

    'invalidNumbersOutOf': ['%s', '%t'],

    'reportSubtitleForCountry': ['%c'],
    'dataSourcedTemplate': ['%d', '%t', '%z', '%a'],

    // Time Ago (uses %n for number)
    'timeAgoMinute': ['%n'],
    'timeAgoMinutesPlural': ['%n'],
    'timeAgoHour': ['%n'],
    'timeAgoHoursPlural': ['%n'],

    // Page Titles (uses %s for country name)
    'mainIndexTitle': [], // This is a static title, no placeholder needed
    'countryReportTitle': ['%s']
};

module.exports = { MASTER_KEYS };