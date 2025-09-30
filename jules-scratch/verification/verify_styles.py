from playwright.sync_api import Page, expect
import os

def test_styles_are_applied(page: Page):
    """
    This test verifies that the new CSS classes are applied correctly on the main index page.
    """
    # 1. Arrange: Go to the generated index.html page.
    file_path = os.path.abspath("public/index.html")
    page.goto(f"file://{file_path}")

    # 2. Assert: Check that a few key elements have the correct classes or styles.
    # We'll check the body for the overall style, a card, and a button.
    body = page.locator("body")
    expect(body).to_have_class("body-styles")

    card = page.locator(".card").first
    expect(card).to_be_visible()

    theme_button = page.locator(".theme-toggle-button")
    expect(theme_button).to_be_visible()

    # 3. Screenshot: Capture the final result for visual verification.
    page.screenshot(path="jules-scratch/verification/verification.png")