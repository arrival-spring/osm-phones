import pathlib
from playwright.sync_api import sync_playwright, Page, expect

def run_verification(page: Page):
    # Construct the absolute path to the local HTML file
    file_path = pathlib.Path('/app/public/belgië---belgique---belgien/vlaanderen.html').as_uri()

    # Navigate to the local file
    page.goto(file_path)

    # Wait for the first list to be present
    expect(page.locator(".report-list").first).to_be_visible()

    # Take a screenshot to verify the diff highlighting
    page.screenshot(path="jules-scratch/verification/verification.png")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        run_verification(page)
        browser.close()

if __name__ == "__main__":
    main()