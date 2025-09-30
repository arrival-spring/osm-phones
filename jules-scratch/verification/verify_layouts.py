from playwright.sync_api import Page, expect
import os

def test_country_page_layout(page: Page):
    """
    This test verifies that the country page layout is correct.
    """
    # 1. Arrange: Go to the generated france.html page.
    file_path = os.path.abspath("public/france.html")
    page.goto(f"file://{file_path}")

    # 2. Assert: Check that a list item is visible.
    list_item = page.locator(".list-item").first
    expect(list_item).to_be_visible()

    # 3. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/country_page.png")

def test_division_page_layout(page: Page):
    """
    This test verifies that the division page layout is correct.
    """
    # 1. Arrange: Go to the generated cantal.html page.
    file_path = os.path.abspath("public/france/cantal.html")
    page.goto(f"file://{file_path}")

    # 2. Assert: Check that a list item is visible.
    list_item = page.locator(".list-item").first
    expect(list_item).to_be_visible()

    # 3. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/division_page.png")