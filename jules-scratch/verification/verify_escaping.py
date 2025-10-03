from playwright.sync_api import sync_playwright
import pathlib

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Set a larger viewport
        page.set_viewport_size({"width": 1280, "height": 800})

        # Get the absolute path to the file
        file_path = pathlib.Path("./public/belgië-belgique-belgien/vlaanderen.html").resolve()

        page.goto(f"file://{file_path}")
        # Wait for the page to be fully loaded
        page.wait_for_load_state('networkidle')

        # Take a full page screenshot
        page.screenshot(path="jules-scratch/verification/verification.png", full_page=True)
        browser.close()

run()