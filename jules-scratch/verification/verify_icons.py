from playwright.sync_api import Page, expect
import os

def test_report_page(page: Page):
    # The report is a local file, so we construct a file:// URL
    file_path = os.path.abspath("public/belgië-belgique-belgien/vlaanderen.html")
    page.goto(f"file://{file_path}")

    # Check for the presence of an icon in the first list item
    # This assumes there is at least one item in the report
    first_item_icon = page.locator(".report-list-item .list-item-icon-container i").first

    # Assert that the icon container is visible
    expect(first_item_icon).to_be_visible()

    # Take a screenshot to visually verify the result
    page.screenshot(path="jules-scratch/verification/verification.png")