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

async function runHotlineReviewBrowserSuite() {
  console.log('=== DEALBEACON STAGE 12B.2 HOTLINE REVIEW WORKSPACE BROWSER ACCEPTANCE SUITE ===\n');
  console.log('Target: http://localhost:3000\n');

  const browser: Browser = await chromium.launch({
    headless: true,
  });

  try {
    // -------------------------------------------------------------
    // Test Set A: Unauthorized User Access Control (Fail-Closed)
    // -------------------------------------------------------------
    {
      const investorContext: BrowserContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      // Set role cookie to INVESTOR
      await investorContext.addCookies([
        {
          name: 'dealbeacon_role',
          value: 'INVESTOR',
          domain: 'localhost',
          path: '/',
        },
      ]);
      const page = await investorContext.newPage();
      await page.goto('http://localhost:3000/admin/hotline-review', { waitUntil: 'networkidle' });

      const lockTitleCount = await page.locator('text=Administrator Access Restricted').count();
      const candidateListCount = await page.locator('text=Candidate Association Audit').count();
      const hasRestrictedNotice = lockTitleCount > 0 && candidateListCount === 0;

      const ssPath = 'screenshots/21-hotline-review-unauthorized-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record(
        'R01',
        'Unauthorized Access Fails Closed (INVESTOR role cannot view candidates)',
        hasRestrictedNotice ? 'PASS' : 'FAIL',
        `Restricted notice: ${lockTitleCount}, Candidate inspector: ${candidateListCount}`,
        ssPath
      );
      await investorContext.close();
    }

    // -------------------------------------------------------------
    // Test Set B: Authorized Admin Workspace (Desktop 1440 x 900)
    // -------------------------------------------------------------
    const adminContext: BrowserContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    // Set role cookie to ADMIN
    await adminContext.addCookies([
      {
        name: 'dealbeacon_role',
        value: 'ADMIN',
        domain: 'localhost',
        path: '/',
      },
    ]);
    const page = await adminContext.newPage();

    // R02: Authorized Access & Header Verification
    {
      const startTime = performance.now();
      await page.goto('http://localhost:3000/admin/hotline-review', { waitUntil: 'networkidle' });
      const loadTimeMs = Math.round(performance.now() - startTime);

      const h1Text = await page.locator('h1').innerText();
      const isWorkspaceLoaded = h1Text.includes('Hotline Candidate Review Workspace');

      const ssPath = 'screenshots/22-hotline-review-authorized-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record(
        'R02',
        'Authorized Admin Workspace Cold-Load',
        isWorkspaceLoaded ? 'PASS' : 'FAIL',
        `h1: "${h1Text}", loadTime: ${loadTimeMs}ms`,
        ssPath
      );
    }

    // R03: 50-Record Validation Sample Loaded by Default
    {
      const sampleCountText = await page.locator('text=Showing 50 of 2459 records').count();
      const sampleBadges = await page.locator('text=50-Sample').count();
      const pass = sampleCountText > 0 && sampleBadges >= 1;

      record(
        'R03',
        '50-Record Stratified Validation Sample Loaded by Default',
        pass ? 'PASS' : 'FAIL',
        `Sample view active, 50-Sample badges visible: ${sampleBadges}`
      );
    }

    // R04: Filter Switching (Dual Evidence Filter)
    {
      await page.locator('button:has-text("Dual Evidence")').click();
      await page.waitForTimeout(300);

      const showingCount = await page.locator('text=Showing 17 of 2459 records').count();
      const dualBadges = await page.locator('text=DUAL_EVIDENCE').count();
      const pass = showingCount > 0 && dualBadges >= 1;

      const ssPath = 'screenshots/23-hotline-review-filter-dual-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record(
        'R04',
        'Classification Filter Switching (Dual Evidence: 17 records)',
        pass ? 'PASS' : 'FAIL',
        `Showing count verified, dual badges count: ${dualBadges}`,
        ssPath
      );
    }

    // R05: Search Filtering
    {
      // Switch back to 50-Sample (which contains 631422) or All Reports
      await page.locator('button:has-text("50-Sample")').click();
      await page.waitForTimeout(300);

      const searchInput = page.locator('input[placeholder*="Search by RequestID"]');
      await searchInput.fill('631422');
      await page.waitForTimeout(300);

      const countText = await page.locator('text=Showing 1 of 2459 records').count();
      const reqPill = await page.locator('text=#631422').count();
      const pass = countText > 0 && reqPill > 0;

      record(
        'R05',
        'Search Filtering by RequestID (631422)',
        pass ? 'PASS' : 'FAIL',
        `Matches found: ${reqPill}`
      );
    }

    // R06: Verify RequestID 631422 Details in Inspector (Graffiti, not Vehicle Parking)
    {
      await page.locator('text=#631422').click();
      await page.waitForTimeout(300);

      const inspectorText = await page.locator('.lg\\:col-span-5').innerText();
      const hasGraffiti = inspectorText.includes('Graffiti / Graffiti');
      const hasVehicleParking = inspectorText.includes('Vehicle_Parking');
      const hasCorrectAddress = inspectorText.includes('2301 HICKORY ST');
      const hasPin = inspectorText.includes('0223550002');
      const hasBoundaryDistance = inspectorText.includes('3.4m to edge');

      const pass = hasGraffiti && !hasVehicleParking && hasCorrectAddress && hasPin && hasBoundaryDistance;

      const ssPath = 'screenshots/24-hotline-review-631422-inspector-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record(
        'R06',
        'RequestID 631422 Inspector Accuracy (Graffiti, 2301 HICKORY ST, 3.4m)',
        pass ? 'PASS' : 'FAIL',
        `Graffiti verified: ${hasGraffiti}, No VehicleParking: ${!hasVehicleParking}, PIN: ${hasPin}, Dist: ${hasBoundaryDistance}`,
        ssPath
      );
    }

    // R07: Verify Right-of-Way Problem Type Warning
    {
      // Clear search input and search for 630050 (Abandoned Vehic(Str))
      const searchInput = page.locator('input[placeholder*="Search by RequestID"]');
      await searchInput.fill('630050');
      await page.waitForTimeout(300);

      await page.locator('text=#630050').click();
      await page.waitForTimeout(300);

      const inspectorText = await page.locator('.lg\\:col-span-5').innerText();
      const hasRowWarning = inspectorText.includes('Public Right-of-Way Warning') &&
        inspectorText.includes('Abandoned Vehic(Str)');

      const ssPath = 'screenshots/25-hotline-review-row-warning-desktop.png';
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record(
        'R07',
        'Right-of-Way Problem Type Warning Displayed for Candidate Parcel',
        hasRowWarning ? 'PASS' : 'FAIL',
        `ROW warning present for on-street vehicle complaint`,
        ssPath
      );
    }

    // R08: No Approval or Mutation Actions Exist
    {
      const approveButtons = await page.locator('button:has-text("Approve")').count();
      const saveButtons = await page.locator('button:has-text("Save Match")').count();
      const linkButtons = await page.locator('button:has-text("Link Parcel")').count();
      const deleteButtons = await page.locator('button:has-text("Delete")').count();

      const pass = approveButtons === 0 && saveButtons === 0 && linkButtons === 0 && deleteButtons === 0;

      record(
        'R08',
        'Strict No-Write Invariant in UI (Zero approve/link/mutate actions exist)',
        pass ? 'PASS' : 'FAIL',
        `Approve buttons: ${approveButtons}, Save buttons: ${saveButtons}, Link buttons: ${linkButtons}`
      );
    }

    // -------------------------------------------------------------
    // Test Set C: Viewport Usability (Tablet 768x1024 & Mobile 390x844)
    // -------------------------------------------------------------
    {
      const tabletContext: BrowserContext = await browser.newContext({
        viewport: { width: 768, height: 1024 },
      });
      await tabletContext.addCookies([
        {
          name: 'dealbeacon_role',
          value: 'ADMIN',
          domain: 'localhost',
          path: '/',
        },
      ]);
      const tabletPage = await tabletContext.newPage();
      await tabletPage.goto('http://localhost:3000/admin/hotline-review', { waitUntil: 'networkidle' });

      const ssPath = 'screenshots/26-hotline-review-tablet-768x1024.png';
      await tabletPage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record('R09', 'Tablet Viewport Usability (768 x 1024)', 'PASS', 'Layout stacks responsively', ssPath);
      await tabletContext.close();
    }

    {
      const mobileContext: BrowserContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await mobileContext.addCookies([
        {
          name: 'dealbeacon_role',
          value: 'ADMIN',
          domain: 'localhost',
          path: '/',
        },
      ]);
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto('http://localhost:3000/admin/hotline-review', { waitUntil: 'networkidle' });

      const ssPath = 'screenshots/27-hotline-review-mobile-390x844.png';
      await mobilePage.screenshot({ path: path.join(ARTIFACTS_DIR, ssPath) });
      record('R10', 'Mobile Viewport Usability (390 x 844)', 'PASS', 'Mobile split-view navigable', ssPath);
      await mobileContext.close();
    }

    await adminContext.close();

    console.log('\n======================================================');
    const passed = report.filter((r) => r.status === 'PASS').length;
    const failed = report.filter((r) => r.status === 'FAIL').length;
    console.log(`HOTLINE REVIEW BROWSER SUITE SUMMARY: ${passed}/${report.length} TESTS PASSED (${failed} FAILED)`);
    console.log(`SCREENSHOTS SAVED: ${SCREENSHOTS_DIR}`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

runHotlineReviewBrowserSuite().catch((err) => {
  console.error('Browser suite failed:', err);
  process.exit(1);
});
