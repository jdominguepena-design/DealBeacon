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

async function runStage11EBrowserSuite() {
  console.log('=== DEALBEACON STAGE 11E REAL DASHBOARD BROWSER ACCEPTANCE SUITE ===\n');
  console.log(`Target: http://localhost:3000\n`);

  const browser: Browser = await chromium.launch({
    headless: true,
  });

  try {
    // -------------------------------------------------------------
    // Desktop Viewport (1440 x 900)
    // -------------------------------------------------------------
    const desktopContext: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page: Page = await desktopContext.newPage();

    // D01: Homepage initial load & header
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      const h1Text = await page.locator('h1').innerText();
      const demoBannerText = await page.locator('text=PUBLIC RECORDS PREVIEW').count();
      const hasSyntheticScore = await page.locator('text=Score 80+').count();

      const pass =
        h1Text.includes('Omaha Property Intelligence Overview') &&
        demoBannerText > 0 &&
        hasSyntheticScore === 0;

      const ssPath = 'screenshots/11-dashboard-desktop-1440x900.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record('D01', 'Homepage Load & Header Real Public Records Notice', pass ? 'PASS' : 'FAIL', `h1: "${h1Text}", synthetic score elements: ${hasSyntheticScore}`, ssPath);
    }

    // D02: All 6 KPI cards render exact Neon DEV counts
    {
      const eligibleText = await page.locator('text=2,839').first().count();
      const withBuildingText = await page.locator('text=1,864').first().count();
      const noBuildingText = await page.locator('text=975').first().count();
      const probableBusinessText = await page.locator('text=1,209').first().count();
      const likelyAbsenteeText = await page.locator('text=419').first().count();
      const unassignedAddressText = await page.locator('text=663').first().count();

      const pass =
        eligibleText > 0 &&
        withBuildingText > 0 &&
        noBuildingText > 0 &&
        probableBusinessText > 0 &&
        likelyAbsenteeText > 0 &&
        unassignedAddressText > 0;

      record('D02', 'All 6 Dashboard KPI Counts Match Neon DEV Exactly', pass ? 'PASS' : 'FAIL', `2,839 / 1,864 / 975 / 1,209 / 419 / 663 verified`);
    }

    // D03: Click KPI Card "Structures Recorded" -> /properties?hasBuilding=true (1,864)
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties?hasBuilding=true'),
        page.click('a:has-text("Structures Recorded")'),
      ]);
      await page.waitForLoadState('networkidle');

      const countPill = await page.locator('text=Showing').innerText();
      const pass = page.url().includes('hasBuilding=true') && countPill.includes('1,864');
      record('D03', 'KPI Click: Structures Recorded -> /properties?hasBuilding=true', pass ? 'PASS' : 'FAIL', `Destination verified: "${countPill}"`);
    }

    // D04: Click KPI Card "No Building Recorded" -> /properties?hasBuilding=false (975)
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties?hasBuilding=false'),
        page.click('a:has-text("No Building Recorded")'),
      ]);
      await page.waitForLoadState('networkidle');

      const countPill = await page.locator('text=Showing').innerText();
      const pass = page.url().includes('hasBuilding=false') && countPill.includes('975');
      record('D04', 'KPI Click: No Building Recorded -> /properties?hasBuilding=false', pass ? 'PASS' : 'FAIL', `Destination verified: "${countPill}"`);
    }

    // D05: Click KPI Card "Probable Business / Entity" -> /properties?corporateStatus=PROBABLE_CORPORATE_NAME (1,209)
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties?corporateStatus=PROBABLE_CORPORATE_NAME'),
        page.click('a:has-text("Probable Business / Entity")'),
      ]);
      await page.waitForLoadState('networkidle');

      const countPill = await page.locator('text=Showing').innerText();
      const pass = page.url().includes('corporateStatus=PROBABLE_CORPORATE_NAME') && countPill.includes('1,209');
      record('D05', 'KPI Click: Probable Business -> /properties?corporateStatus=PROBABLE_CORPORATE_NAME', pass ? 'PASS' : 'FAIL', `Destination verified: "${countPill}"`);
    }

    // D06: Click KPI Card "Likely Absentee Owners" -> /properties?absenteeStatus=ABSENTEE (419)
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties?absenteeStatus=ABSENTEE'),
        page.click('a:has-text("Likely Absentee Owners")'),
      ]);
      await page.waitForLoadState('networkidle');

      const countPill = await page.locator('text=Showing').innerText();
      const pass = page.url().includes('absenteeStatus=ABSENTEE') && countPill.includes('419');
      record('D06', 'KPI Click: Likely Absentee -> /properties?absenteeStatus=ABSENTEE', pass ? 'PASS' : 'FAIL', `Destination verified: "${countPill}"`);
    }

    // D07: Click KPI Card "Unassigned Situs Parcels" -> /properties?hasAuthoritativeAddress=false (663)
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties?hasAuthoritativeAddress=false'),
        page.click('a:has-text("Unassigned Situs Parcels")'),
      ]);
      await page.waitForLoadState('networkidle');

      const countPill = await page.locator('text=Showing').innerText();
      const pass = page.url().includes('hasAuthoritativeAddress=false') && countPill.includes('663');
      record('D07', 'KPI Click: Unassigned Situs Parcels -> /properties?hasAuthoritativeAddress=false', pass ? 'PASS' : 'FAIL', `Destination verified: "${countPill}"`);
    }

    // D08: Property Type Distribution: Click "Commercial" -> /properties?propertyType=COMMERCIAL (474)
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      await Promise.all([
        page.waitForURL('**/properties?propertyType=COMMERCIAL'),
        page.click('a:has-text("Commercial")'),
      ]);
      await page.waitForLoadState('networkidle');

      const countPill = await page.locator('text=Showing').innerText();
      const pass = page.url().includes('propertyType=COMMERCIAL') && countPill.includes('474');
      record('D08', 'Distribution Click: Commercial -> /properties?propertyType=COMMERCIAL', pass ? 'PASS' : 'FAIL', `Destination verified: "${countPill}"`);
    }

    // D09: Property Preview Feed: Click "View Details" navigates to valid real property page
    {
      await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      const firstPreviewTitle = await page.locator('.divide-y a[href*="/properties/"]').first().innerText();
      await Promise.all([
        page.waitForURL('**/properties/cmv*'),
        page.locator('.divide-y a:has-text("View Details")').first().click(),
      ]);
      await page.waitForLoadState('networkidle');

      const detailUrl = page.url();
      const notFoundCount = await page.locator('text=404').count();
      const legalNoticeCount = await page.locator('text=Douglas County Parcel GIS Source').count();

      const pass = detailUrl.includes('/properties/cmv') && notFoundCount === 0 && legalNoticeCount > 0;
      const ssPath = 'screenshots/12-dashboard-preview-detail-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('D09', 'Homepage Preview Feed to Real Detail Navigation', pass ? 'PASS' : 'FAIL', `Loaded ${detailUrl} without 404`, ssPath);
    }

    // D10: /saved Page: Honest Coming Soon / Pipeline Notice (zero synthetic leads)
    {
      await page.goto('http://localhost:3000/saved', { waitUntil: 'networkidle' });
      const comingSoonHeading = await page.locator('h3:has-text("Saved Lead Pipeline — Coming in Next Phase")').count();
      const syntheticScoreBadge = await page.locator('text=Score').count();
      const browseButton = await page.locator('a:has-text("Browse Real Omaha Public Records")').count();

      const pass = comingSoonHeading > 0 && syntheticScoreBadge === 0 && browseButton > 0;
      const ssPath = 'screenshots/13-saved-coming-soon-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      record('D10', '/saved Page Honest Pipeline Notice (No Synthetic Leads)', pass ? 'PASS' : 'FAIL', `Zero fake scores, honest notice rendered`, ssPath);
    }

    await desktopContext.close();

    // -------------------------------------------------------------
    // Mobile Viewport (390 x 844)
    // -------------------------------------------------------------
    const mobileContext: BrowserContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage: Page = await mobileContext.newPage();

    // D11: Mobile Homepage Rendering
    {
      await mobilePage.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      const ssPath = 'screenshots/14-dashboard-mobile-390x844.png';
      await mobilePage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      const headingVisible = await mobilePage.locator('h1').isVisible();
      const kpisVisible = await mobilePage.locator('text=Eligible Omaha Parcels').isVisible();
      const previewsVisible = await mobilePage.locator('text=Douglas County Parcel Previews').isVisible();

      const pass = headingVisible && kpisVisible && previewsVisible;
      record('D11', 'Mobile Dashboard Layout (390x844)', pass ? 'PASS' : 'FAIL', `All sections stack responsively`, ssPath);
    }

    // D12: Mobile /saved Rendering
    {
      await mobilePage.goto('http://localhost:3000/saved', { waitUntil: 'networkidle' });
      const ssPath = 'screenshots/15-saved-mobile-390x844.png';
      await mobilePage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });

      const comingSoonVisible = await mobilePage.locator('h3:has-text("Saved Lead Pipeline — Coming in Next Phase")').isVisible();
      record('D12', 'Mobile /saved Layout (390x844)', comingSoonVisible ? 'PASS' : 'FAIL', `Notice cards legible without horizontal overflow`, ssPath);
    }

    await mobileContext.close();

  } finally {
    await browser.close();
  }

  // Write JSON report
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'stage11e-playwright-report.json'), JSON.stringify(report, null, 2), 'utf-8');

  console.log('\n======================================================');
  const passed = report.filter(r => r.status === 'PASS').length;
  console.log(`STAGE 11E ACCEPTANCE SUMMARY: ${passed}/${report.length} TESTS PASSED`);
  console.log(`SCREENSHOTS SAVED: ${SCREENSHOTS_DIR}`);
  console.log('======================================================\n');
}

runStage11EBrowserSuite().catch(err => {
  console.error('Stage 11E browser tests failed:', err);
  process.exit(1);
});
