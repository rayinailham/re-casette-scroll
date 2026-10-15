import asyncio, json, os
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width": 1080, "height": 1920})
        await pg.goto("file://" + os.path.abspath("comp.html")); await pg.evaluate("window.__ready")
        print(json.dumps(await pg.evaluate("window.__events()"), indent=1)); await b.close()
asyncio.run(main())
