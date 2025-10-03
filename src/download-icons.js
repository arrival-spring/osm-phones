const fs = require('fs/promises');
const path = require('path');
const { ICONS_DIR, ICON_PACKS, GITHUB_API_BASE_URL } = require('./constants.js')


/**
 * Downloads all SVG files for a single icon pack.
 * @param {string} packName The descriptive name of the icon pack.
 * @param {object} packDetails The owner, repo, and path details.
 */
async function downloadSinglePack(packName, packDetails) {
    const { owner, repo, folder_path } = packDetails;
    const GITHUB_API_URL = `${GITHUB_API_BASE_URL}/${owner}/${repo}/contents/${folder_path}`;
    const FINAL_OUTPUT_DIR = path.join(ICONS_DIR, packName);
    console.log(`Fetching file list from: ${GITHUB_API_URL}`);
    const { default: fetch } = await import('node-fetch');

    // 1. Get the list of files
    const response = await fetch(GITHUB_API_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch directory contents: ${response.statusText}`);
    }
    const files = await response.json();

    // 2. Filter for SVG files and ensure the output directory exists
    const svgFiles = files.filter(file => file.type === 'file' && file.name.endsWith('.svg'));
    await fs.mkdir(FINAL_OUTPUT_DIR, { recursive: true });

    console.log(`Found ${svgFiles.length} SVG icons. Starting download...`);

    // 3. Download each SVG file
    const downloadPromises = svgFiles.map(async (file) => {
        // The 'download_url' is the direct link to the raw file content
        const rawUrl = file.download_url;
        const filePath = path.join(FINAL_OUTPUT_DIR, file.name);

        try {
            const fileResponse = await fetch(rawUrl);
            if (!fileResponse.ok) {
                throw new Error(`Failed to download ${file.name}: ${fileResponse.statusText}`);
            }

            const fileContent = await fileResponse.text();
            await fs.writeFile(filePath, fileContent, 'utf-8');

            return `Downloaded: ${file.name}`;
        } catch (error) {
            console.error(`Error downloading ${file.name}:`, error.message);
            return `Failed: ${file.name}`;
        }
    });

    const results = await Promise.all(downloadPromises);
    console.log('\n--- Download Summary ---');
    results.forEach(result => console.log(result));
    console.log('------------------------\n');
}

/**
 * Main function to iterate over all configured icon packs and download them.
 */
async function downloadAllIcons() {
    console.log('==============================================');
    console.log('== STARTING ICON DOWNLOAD FOR STATIC BUILD ==');
    console.log('==============================================');

    const packPromises = Object.entries(ICON_PACKS).map(([name, details]) => {
        return downloadSinglePack(name, details);
    });

    await Promise.all(packPromises);

    console.log('\n=============================================');
    console.log('== ALL ICON DOWNLOADS COMPLETE / SKIPPED ==');
    console.log('=============================================');
}


// --- Execution ---

downloadAllIcons().catch(error => {
    // This catches fatal errors outside of the individual pack download logic
    console.error('\n*** FATAL ERROR in icon download script:', error);
    process.exit(1); 
});