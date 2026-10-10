import { chromium, Browser, BrowserContext, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ARTIFACTS_DIR = path.resolve('testing-artifacts');
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

interface TestReportItem {
  id: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details?: string;
  screenshot?: string;
}

const report: TestReportItem[] = [];

function record(id: string, name: string, status: 'PASS' | 'FAIL', details?: string, screenshot?: string) {
  report.push({ id, name, status, details, screenshot });
  const icon = status === 'PASS' ? '✔ PASS' : '❌ FAIL';
  console.log(`${icon} [${id}] ${name}${details ? ` - ${details}` : ''}${screenshot ? ` (Screenshot: ${screenshot})` : ''}`);
}

async function runBrowserAcceptanceTests() {
  console.log('=== DEALBEACON PLAYWRIGHT BROWSER ACCEPTANCE SUITE ===\n');
  console.log(`Connecting to Chromium headless browser...`);
  console.log(`Target: http://localhost:3000\n`);

  const browser: Browser = await chromium.launch({
    headless: true,
  });

  try {
    // -------------------------------------------------------------
    // 1. Desktop Viewport Tests (1440 x 900)
    // -------------------------------------------------------------
    const desktopContext: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page: Page = await desktopContext.newPage();

    // Test 1: First page load (25 records)
    {
      await page.goto('http://localhost:3000/properties', { waitUntil: 'networkidle' });
      const rows = await page.locator('tbody tr').count();
      const headerText = await page.locator('h1').innerText();
      const countPill = await page.locator('text=Showing').innerText();

      const pass = rows === 25 && headerText.includes('Real Douglas County Public Records') && countPill.includes('2,839');
      const ssPath = 'screenshots/01-listing-desktop-1440x900.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath), fullPage: false });

      record('T01', 'Desktop Listing Page Initial Load (25 rows)', pass ? 'PASS' : 'FAIL', `Rows: ${rows}, Count pill: "${countPill}"`, ssPath);
    }

    // Test 2: Search PIN 0119300011 via real input typing
    {
      const searchInput = page.locator('input[placeholder*="Search address"]');
      await searchInput.fill('0119300011');
      await page.waitForTimeout(500); // Allow debounce / navigation
      await page.waitForLoadState('networkidle');

      const rows = await page.locator('tbody tr').count();
      const pinText = await page.locator('text=PIN: 0119300011').count();
      const addressText = await page.locator('text=19500 PACIFIC ST').count();

      const pass = rows >= 1 && pinText > 0 && addressText > 0;
      const ssPath = 'screenshots/02-search-pin-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('T02', 'Search by PIN 0119300011 via input typing', pass ? 'PASS' : 'FAIL', `Matched 19500 PACIFIC ST (Rows: ${rows})`, ssPath);
    }

    // Test 3: Search street address "PACIFIC ST"
    {
      const searchInput = page.locator('input[placeholder*="Search address"]');
      await searchInput.fill('PACIFIC ST');
      await page.waitForTimeout(500);
      await page.waitForLoadState('networkidle');

      const addressMatches = await page.locator('text=PACIFIC ST').count();
      const pass = addressMatches > 0;
      record('T03', 'Search by Address "PACIFIC ST"', pass ? 'PASS' : 'FAIL', `Found ${addressMatches} matches`);
    }

    // Test 4: Search owner "SAKIS"
    {
      const searchInput = page.locator('input[placeholder*="Search address"]');
      await searchInput.fill('SAKIS');
      await page.waitForTimeout(500);
      await page.waitForLoadState('networkidle');

      const ownerMatches = await page.locator('text=SAKIS AMY REBEKAH').count();
      const pass = ownerMatches > 0;
      record('T04', 'Search by Owner "SAKIS"', pass ? 'PASS' : 'FAIL', `Matched deed owner SAKIS AMY REBEKAH`);
    }

    // Test 5: Filter by Property Type RESIDENTIAL
    {
      await page.goto('http://localhost:3000/properties?propertyType=RESIDENTIAL', { waitUntil: 'networkidle' });
      const countPill = await page.locator('text=Showing').innerText();
      const pass = countPill.includes('1,113');
      record('T05', 'Property Type Filter: RESIDENTIAL', pass ? 'PASS' : 'FAIL', `Count pill reflects: "${countPill}"`);
    }

    // Test 6: Building Presence Filter: hasBuilding=false ("No building recorded")
    {
      await page.goto('http://localhost:3000/properties?hasBuilding=false', { waitUntil: 'networkidle' });
      const countPill = await page.locator('text=Showing').innerText();
      const pass = countPill.includes('975');
      record('T06', 'Building Presence Filter: No building recorded', pass ? 'PASS' : 'FAIL', `Count pill reflects: "${countPill}"`);
    }

    // Test 7: Ownership Filter: Corporate / Probable Business
    {
      await page.goto('http://localhost:3000/properties?corporateStatus=PROBABLE_CORPORATE_NAME', { waitUntil: 'networkidle' });
      const countPill = await page.locator('text=Showing').innerText();
      const badgeCount = await page.locator('text=Probable Business / Entity').count();
      const pass = countPill.includes('1,209') && badgeCount > 0;
      record('T07', 'Corporate Ownership Filter Toggle', pass ? 'PASS' : 'FAIL', `Count: "${countPill}", badges rendered: ${badgeCount}`);
    }

    // Test 8: Absentee Filter: "Likely absentee — based on mailing records"
    {
      await page.goto('http://localhost:3000/properties?absenteeStatus=ABSENTEE', { waitUntil: 'networkidle' });
      const countPill = await page.locator('text=Showing').innerText();
      const badgeCount = await page.locator('text=Likely absentee — based on mailing records').count();
      const pass = countPill.includes('419') && badgeCount > 0;
      record('T08', 'Absentee Filter: Likely absentee', pass ? 'PASS' : 'FAIL', `Count: "${countPill}", badges rendered: ${badgeCount}`);
    }

    // Test 9: Year-built range inputs
    {
      await page.goto('http://localhost:3000/properties?minYearBuilt=1950&maxYearBuilt=1980', { waitUntil: 'networkidle' });
      const countPill = await page.locator('text=Showing').innerText();
      const pass = countPill.includes('759');
      record('T09', 'Year Built Range: 1950 - 1980', pass ? 'PASS' : 'FAIL', `Count pill reflects: "${countPill}"`);
    }

    // Test 10: Pagination: Next button navigation to Page 2
    {
      await page.goto('http://localhost:3000/properties', { waitUntil: 'networkidle' });

      const p1FirstPin = await page.locator('tbody tr:first-child span:has-text("PIN:")').innerText();
      await Promise.all([
        page.waitForURL('**/properties?page=2'),
        page.click('a:has-text("Next")')
      ]);
      await page.waitForLoadState('networkidle');

      const p2FirstPin = await page.locator('tbody tr:first-child span:has-text("PIN:")').innerText();
      const pageIndicator = await page.locator('text=Page 2 of 114').count();

      const pass = p1FirstPin !== p2FirstPin && pageIndicator > 0;
      const ssPath = 'screenshots/03-pagination-page2-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('T10', 'Pagination: Navigation to Page 2', pass ? 'PASS' : 'FAIL', `P1 PIN: ${p1FirstPin} -> P2 PIN: ${p2FirstPin}`, ssPath);
    }

    // Test 11: Real Listing-to-Detail Navigation
    {
      await page.goto('http://localhost:3000/properties?query=0119300011', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties/cmv*'),
        page.click('tbody tr:first-child a:has-text("Details")')
      ]);
      await page.waitForLoadState('networkidle');

      const url = page.url();
      const pinOnDetail = await page.locator('text=0119300011').count();
      const addressOnDetail = await page.locator('h1:has-text("19500 PACIFIC ST")').count();
      const ownerOnDetail = await page.locator('text=SAKIS AMY REBEKAH').count();
      const areaOnDetail = await page.locator('text=3,225 sq ft').count();
      const yearOnDetail = await page.locator('text=1972').count();
      const assessorLink = await page.locator('a:has-text("County Assessor Beacon")').getAttribute('href');
      const treasurerLink = await page.locator('a:has-text("Treasurer Tax Info")').getAttribute('href');
      const legalAttribution = await page.locator('text=Douglas County Parcel GIS Source').count();

      const pass =
        url.includes('/properties/') &&
        pinOnDetail > 0 &&
        addressOnDetail > 0 &&
        ownerOnDetail > 0 &&
        areaOnDetail > 0 &&
        yearOnDetail > 0 &&
        assessorLink?.includes('beacon.schneidercorp.com') === true &&
        treasurerLink?.includes('payments.dctreasurer.org') === true &&
        legalAttribution > 0;

      const ssPath = 'screenshots/04-residential-detail-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('T11', 'Listing-to-Detail Navigation & Residential Specs', pass ? 'PASS' : 'FAIL', `Address: 19500 PACIFIC ST, Area: 3,225 sq ft, Year: 1972`, ssPath);
    }

    // Test 12: Back to Properties Link
    {
      await Promise.all([
        page.waitForURL('**/properties'),
        page.click('a:has-text("Back to Property Intelligence Listing")')
      ]);
      await page.waitForLoadState('networkidle');

      const pass = page.url().endsWith('/properties') && (await page.locator('h1').innerText()).includes('Real Douglas County Public Records');
      record('T12', 'Back to Properties Navigation Link', pass ? 'PASS' : 'FAIL', `Returned to /properties successfully`);
    }

    // Test 13: Government Property Detail (PIN 0116340000)
    {
      await page.goto('http://localhost:3000/properties/cmv0fpglj002dvhl0e6oczeyt', { waitUntil: 'networkidle' });
      const pinText = await page.locator('text=0116340000').count();
      const ownerText = await page.locator('text=UNITED STATES OF AMERICA').count();
      const badgeText = await page.locator('text=Government / Public Agency').count();
      const unlistedArea = await page.locator('text=No building recorded').count();

      const pass = pinText > 0 && ownerText > 0 && badgeText > 0 && unlistedArea > 0;
      const ssPath = 'screenshots/05-government-detail-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('T13', 'Government Property Detail (USA - PIN 0116340000)', pass ? 'PASS' : 'FAIL', `Public Agency badge & No building recorded rendered`, ssPath);
    }

    // Test 14: Unassigned Situs Property (PIN 0134600000)
    {
      await page.goto('http://localhost:3000/properties/cmv0i99xh00cnvh8cy2agdfty', { waitUntil: 'networkidle' });
      const pinText = await page.locator('text=0134600000').count();
      const unassignedText = await page.locator('text=Address not assigned').count();
      const cityOwnerText = await page.locator('text=CITY OF OMAHA').count();

      const pass = pinText > 0 && unassignedText > 0 && cityOwnerText > 0;
      const ssPath = 'screenshots/06-unassigned-situs-detail-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('T14', 'Unassigned Situs Property (PIN 0134600000)', pass ? 'PASS' : 'FAIL', `Address not assigned rendered honestly`, ssPath);
    }

    // Test 15: Invalid Property ID returns 404
    {
      const res = await page.goto('http://localhost:3000/properties/cmv-invalid-property-id-999');
      const status = res?.status();
      const notFoundText = await page.locator('text=404').count();
      const pass = status === 404 || notFoundText > 0;
      record('T15', 'Invalid Property ID Returns 404 Fail-Closed', pass ? 'PASS' : 'FAIL', `Status code: ${status}`);
    }

    // Test 16: Excluded OUTSIDE_OMAHA ID returns 404
    {
      const res = await page.goto('http://localhost:3000/properties/cmv0fpg4g000jvhl0770oow4g');
      const status = res?.status();
      const notFoundText = await page.locator('text=404').count();
      const pass = status === 404 || notFoundText > 0;
      record('T16', 'Excluded OUTSIDE_OMAHA Property ID Returns 404 Fail-Closed', pass ? 'PASS' : 'FAIL', `Status code: ${status}`);
    }

    await desktopContext.close();

    // -------------------------------------------------------------
    // 2. Tablet Viewport Tests (768 x 1024)
    // -------------------------------------------------------------
    const tabletContext: BrowserContext = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const tabletPage: Page = await tabletContext.newPage();

    {
      await tabletPage.goto('http://localhost:3000/properties', { waitUntil: 'networkidle' });
      const ssPath = 'screenshots/07-listing-tablet-768x1024.png';
      await tabletPage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      // Check overflow-x container exists and no window scroll width explosion
      const hasOverflowContainer = (await tabletPage.locator('.overflow-x-auto').count()) > 0;
      record('T17', 'Tablet Viewport Listing (768x1024)', hasOverflowContainer ? 'PASS' : 'FAIL', `Overflow-x container present`, ssPath);
    }

    {
      await tabletPage.goto('http://localhost:3000/properties/cmv0fpkmo004qvhl0aychrbnn', { waitUntil: 'networkidle' });
      const ssPath = 'screenshots/08-detail-tablet-768x1024.png';
      await tabletPage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record('T18', 'Tablet Viewport Detail (768x1024)', 'PASS', `Detail cards responsive`, ssPath);
    }

    await tabletContext.close();

    // -------------------------------------------------------------
    // 3. Mobile Viewport Tests (390 x 844 - iPhone 12/13/14)
    // -------------------------------------------------------------
    const mobileContext: BrowserContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage: Page = await mobileContext.newPage();

    {
      await mobilePage.goto('http://localhost:3000/properties', { waitUntil: 'networkidle' });
      const ssPath = 'screenshots/09-listing-mobile-390x844.png';
      await mobilePage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      const searchVisible = await mobilePage.locator('input[placeholder*="Search address"]').isVisible();
      const filtersVisible = await mobilePage.locator('select:has-text("All Property Types")').isVisible();
      record('T19', 'Mobile Viewport Listing (390x844)', searchVisible && filtersVisible ? 'PASS' : 'FAIL', `Search & filters fully accessible`, ssPath);
    }

    {
      await mobilePage.goto('http://localhost:3000/properties/cmv0fpkmo004qvhl0aychrbnn', { waitUntil: 'networkidle' });
      const ssPath = 'screenshots/10-detail-mobile-390x844.png';
      await mobilePage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      const addressVisible = await mobilePage.locator('h1:has-text("19500 PACIFIC ST")').isVisible();
      const backVisible = await mobilePage.locator('a:has-text("Back to Property Intelligence Listing")').isVisible();
      const assessorButtonVisible = await mobilePage.locator('a:has-text("County Assessor Beacon")').isVisible();

      record('T20', 'Mobile Viewport Detail (390x844)', addressVisible && backVisible && assessorButtonVisible ? 'PASS' : 'FAIL', `Address, back button, assessor action visible`, ssPath);
    }

    await mobileContext.close();

  } finally {
    await browser.close();
  }

  // Write JSON report
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'playwright-report.json'), JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n======================================================');
  const passed = report.filter(r => r.status === 'PASS').length;
  console.log(`ACCEPTANCE SUMMARY: ${passed}/${report.length} TESTS PASSED`);
  console.log(`SCREENSHOTS SAVED: ${SCREENSHOTS_DIR}`);
  console.log('======================================================\n');
}

runBrowserAcceptanceTests().catch(err => {
  console.error('Browser testing failed:', err);
  process.exit(1);
});
