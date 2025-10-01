import asyncio
from playwright.async_api import async_playwright, expect

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        try:
            # 1. Verify Main Page
            print("Navigating to Main Page...")
            await page.goto('http://localhost:8080', wait_until='networkidle')
            await expect(page.get_by_role("heading", name="OSM Phone Number Validation")).to_be_visible()
            await page.screenshot(path='jules-scratch/verification/01-main-page.png')
            print("Screenshot of Main Page taken.")

            # 2. Navigate to and Verify Country Page
            print("Navigating to Country Page...")
            await page.get_by_role("link", name="France").click()
            await page.wait_for_url("**/france.html")
            await expect(page.get_by_role("heading", name="Validation des numéros de téléphone OSM")).to_be_visible()
            await page.screenshot(path='jules-scratch/verification/02-country-page.png')
            print("Screenshot of Country Page taken.")

            # 3. Navigate to and Verify Report Page
            print("Navigating to Report Page...")
            # Uncheck the "hide empty" checkbox to ensure all subdivisions are visible
            hide_empty_checkbox = '#hide-empty'
            await page.wait_for_selector(hide_empty_checkbox, state='visible', timeout=10000)
            if await page.is_checked(hide_empty_checkbox):
                await page.uncheck(hide_empty_checkbox)
                await page.wait_for_timeout(500) # Give UI time to update

            link_selector = 'a[href="france/cantal.html"]'
            await page.wait_for_selector(link_selector, state='visible', timeout=10000)
            await page.get_by_role("link", name="Cantal").click()

            await page.wait_for_url("**/cantal.html")
            await expect(page.get_by_role("heading", name="Rapport sur les numéros de téléphone")).to_be_visible()
            await page.screenshot(path='jules-scratch/verification/03-report-page.png')
            print("Screenshot of Report Page taken.")

            print("All verification steps completed successfully.")

        except Exception as e:
            print(f"An error occurred: {e}")
            await page.screenshot(path='jules-scratch/verification/error.png')
        finally:
            await browser.close()

if __name__ == '__main__':
    asyncio.run(main())