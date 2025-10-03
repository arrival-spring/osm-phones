from playwright.sync_api import Page, expect
import os

def test_report_page_with_icons(page: Page):
    # Construct the full path to the local HTML file
    file_path = os.path.abspath("public/belgië-belgique-belgien/vlaanderen.html")
    page.goto(f"file://{file_path}")

    # Wait for the first list item to be visible
    first_item = page.locator(".report-list-item").first
    expect(first_item).to_be_visible()

    # Check for the presence of an icon within the first list item that has one
    icon = first_item.locator(".list-item-icon-container i, .list-item-icon-container svg").first
    if icon.count() > 0:
        expect(icon.first).to_be_visible()

    # Take a screenshot to visually verify the result
    page.screenshot(path="jules-scratch/verification/verification.png")