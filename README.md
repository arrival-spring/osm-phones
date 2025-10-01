# OpenStreetMap Phone Number Validator

This project generates a static website that reports invalid phone numbers from OpenStreetMap (OSM) data. The goal is to identify and provide an easy way to fix incorrect phone number data in OSM.

The generated site is available at https://arrival-spring.github.io/osm-phones/

## How it works

The project fetches data from OSM, validates phone numbers, and generates a static HTML report. The process is as follows:

1.  **Fetch Data**: For each country and its subdivisions defined in `src/constants.js`, the project queries the Overpass API to fetch OSM elements with phone number tags.
2.  **Validate Numbers**: The fetched phone numbers are validated using `libphonenumber-js`. Numbers are checked for correct formatting and validity for the specific country.
3.  **Generate Reports**: The results are compiled into HTML reports. A main index page lists all countries, each linking to a country-specific page. The country page, in turn, lists reports for its subdivisions. Each subdivision report details the invalid phone numbers, providing direct links to edit the data in various OSM editors (iD, JOSM, etc.).

## How to run

To run the project locally and generate the reports, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/arrival-spring/osm-phones.git
    cd osm-phones
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the build script:**
    ```bash
    npm start
    ```
    This will generate the static site in the `public/` directory.

4.  **Run in test mode:**
    To do a quicker, simplified build for testing purposes, run:
    ```bash
    BUILD_TYPE=simplified npm start
    ```
    This will only process one subdivision for one division for one country, which is much faster than a full build.

## How to add a new country

To add a new country to the report, you need to modify the `COUNTRIES` object in `src/constants.js`. Follow these steps:

1.  **Add a new entry** to the `COUNTRIES` object. You will need to provide:
    *   `name`: The name of the country.
    *   `countryCode`: The two-letter ISO 3166-1 alpha-2 country code.
    *   `locale`: The locale for formatting and language.
    *   `divisions` or `divisionMap`:
        *   Use `divisions` to specify a map of division names to their OSM relation IDs, along with `subdivisionAdminLevel` to fetch subdivisions automatically.
        *   Use `divisionMap` for a hardcoded list of subdivisions.

2.  **Add translations** (optional): If the country uses a language not already present, add a new JSON file in the `locales/` directory (e.g., `de-DE.json` for German).

## License

This project is licensed under the GNU GPL v3.0. See the [LICENSE](LICENSE) file for details.