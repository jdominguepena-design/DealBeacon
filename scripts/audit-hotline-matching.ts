import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAudit() {
  console.log('=== STAGE 12A.1: OMAHA HOTLINE-TO-PARCEL MATCHING AUDIT ===\n');

  // 1. Basic Counts
  const totalHotline = await prisma.hotlineReport.count();
  const totalProperties = await prisma.property.count();
  const insideOmahaProperties = await prisma.property.count({
    where: { municipalJurisdiction: 'INSIDE_OMAHA' }
  });
  const sourceRecords = await prisma.sourceRecord.count();
  const codeViolations = await prisma.codeViolation.count();
  const signals = await prisma.signal.count();

  console.log('1. TABLE COUNTS:');
  console.log(`• hotline_reports: ${totalHotline}`);
  console.log(`• properties: ${totalProperties} (INSIDE_OMAHA: ${insideOmahaProperties})`);
  console.log(`• source_records: ${sourceRecords}`);
  console.log(`• code_violations: ${codeViolations}`);
  console.log(`• signals: ${signals}\n`);

  // 2. Hotline Location Fields
  const withLocationText = await prisma.hotlineReport.count({
    where: { locationText: { not: null } }
  });
  const withCoords = await prisma.hotlineReport.count({
    where: { latitude: { not: null }, longitude: { not: null } }
  });
  const withBoth = await prisma.hotlineReport.count({
    where: { locationText: { not: null }, latitude: { not: null }, longitude: { not: null } }
  });
  const withoutCoords = await prisma.hotlineReport.count({
    where: { OR: [{ latitude: null }, { longitude: null }] }
  });
  const withoutLocationText = await prisma.hotlineReport.count({
    where: { locationText: null }
  });

  console.log('2. HOTLINE GEOMETRY & LOCATION COMPLETENESS:');
  console.log(`• With locationText (LOCDESC): ${withLocationText} (${((withLocationText / totalHotline) * 100).toFixed(1)}%)`);
  console.log(`• With WGS84 coordinates: ${withCoords} (${((withCoords / totalHotline) * 100).toFixed(1)}%)`);
  console.log(`• With BOTH text and coords: ${withBoth} (${((withBoth / totalHotline) * 100).toFixed(1)}%)`);
  console.log(`• Missing coordinates: ${withoutCoords}`);
  console.log(`• Missing locationText: ${withoutLocationText}\n`);

  // 3. Report Categories in Hotline
  const categories = await prisma.hotlineReport.groupBy({
    by: ['reportCategory'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });

  console.log('3. HOTLINE REPORT CATEGORIES:');
  categories.forEach(c => {
    console.log(`• ${c.reportCategory || 'NULL'}: ${c._count.id}`);
  });
  console.log();

  // 4. Problem Types
  const topProblems = await prisma.hotlineReport.groupBy({
    by: ['problemType'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10
  });

  console.log('4. TOP 10 PROBLEM TYPES:');
  topProblems.forEach(p => {
    console.log(`• ${p.problemType || 'NULL'}: ${p._count.id}`);
  });
  console.log();

  // 5. Check if any parcel PIN or identifier exists in raw source payload
  const sampleSourceRecord = await prisma.sourceRecord.findFirst({
    where: { sourceName: 'OMAHA_HOTLINE' },
    select: { rawPayloadJson: true }
  });
  if (sampleSourceRecord) {
    const rawKeys = Object.keys(sampleSourceRecord.rawPayloadJson as object || {});
    console.log('5. RAW HOTLINE ARCGIS ATTRIBUTE FIELDS:');
    console.log(rawKeys.join(', '));
    const hasPinField = rawKeys.some(k => /pin|parcel/i.test(k));
    console.log(`• Any PIN or parcel ID field directly in ArcGIS Hotline layer? ${hasPinField ? 'YES' : 'NO'}\n`);
  }

  // 6. Audit Location Text Patterns (Addresses vs Intersections / ROW)
  const allReports = await prisma.hotlineReport.findMany({
    select: {
      id: true,
      requestId: true,
      reportCategory: true,
      problemType: true,
      locationText: true,
      latitude: true,
      longitude: true,
    }
  });

  let intersectionCount = 0;
  let standardAddressCount = 0;
  let publicRowCategoryCount = 0; // Pothole, Traffic, Street Maintenance
  let housingOrCodeCategoryCount = 0;
  let parkOrTreeCount = 0;

  const intersectionRegex = /\b(&|AND|\/|INTERSECTION|BETWEEN|CORNER|APPROX|NEAR|BLOCK OF|ROW|RAMP|HWY|HIGHWAY|INTERSTATE)\b/i;
  const addressRegex = /^\s*\d+\s+[A-Z0-9\s.,#-]+/i;

  allReports.forEach(r => {
    const loc = r.locationText || '';
    if (intersectionRegex.test(loc) || !addressRegex.test(loc)) {
      intersectionCount++;
    } else {
      standardAddressCount++;
    }

    const cat = (r.reportCategory || '').toLowerCase();
    if (cat.includes('code') || cat.includes('housing')) {
      housingOrCodeCategoryCount++;
    } else if (cat.includes('pothole') || cat.includes('traffic') || cat.includes('street')) {
      publicRowCategoryCount++;
    } else if (cat.includes('tree') || cat.includes('park') || cat.includes('weed')) {
      parkOrTreeCount++;
    }
  });

  console.log('6. LOCATION PATTERN AUDIT:');
  console.log(`• Apparent Standard Street Addresses: ${standardAddressCount} (${((standardAddressCount / totalHotline) * 100).toFixed(1)}%)`);
  console.log(`• Intersections, Non-Specific, or ROW Descriptions: ${intersectionCount} (${((intersectionCount / totalHotline) * 100).toFixed(1)}%)`);
  console.log(`• Categories: Code/Housing = ${housingOrCodeCategoryCount}, Street/Pothole/Traffic = ${publicRowCategoryCount}, Parks/Trees/Weeds = ${parkOrTreeCount}\n`);

  // 7. Privacy Audit: Check if raw payloads contain personal info (reporter names, phone, email)
  const sampleWithPayload = await prisma.sourceRecord.findMany({
    where: { sourceName: 'OMAHA_HOTLINE' },
    take: 10,
    select: { rawPayloadJson: true }
  });

  let piiKeysFound = new Set<string>();
  sampleWithPayload.forEach(s => {
    const p = s.rawPayloadJson as Record<string, any>;
    Object.keys(p).forEach(k => {
      if (/name|phone|email|contact|caller|reporter|address2/i.test(k) && !/sourcename/i.test(k)) {
        piiKeysFound.add(k);
      }
    });
  });
  console.log('7. PRIVACY / PII AUDIT ON HOTLINE ATTRIBUTES:');
  console.log(`• Identified candidate contact/reporter fields: [${Array.from(piiKeysFound).join(', ')}]`);
  if (sampleWithPayload[0]) {
    const p = sampleWithPayload[0].rawPayloadJson as Record<string, any>;
    const sampleVals = Array.from(piiKeysFound).map(k => `${k}: ${p[k] !== undefined ? JSON.stringify(p[k]) : 'null'}`);
    console.log(`• Sample values for candidate fields: ${sampleVals.join(' | ')}\n`);
  }

  // 8. Spatial Intersection Test against Existing Real Parcels
  console.log('8. PRELIMINARY SPATIAL OVERLAP ANALYSIS:');
  // How many Hotline reports fall within bounding box of our 2,839 Omaha parcels?
  const parcels = await prisma.property.findMany({
    where: { municipalJurisdiction: 'INSIDE_OMAHA', latitude: { not: null }, longitude: { not: null } },
    select: { id: true, parcelId: true, address: true, latitude: true, longitude: true, geometryGeoJson: true },
    take: 200 // Sample 200 parcels
  });

  console.log(`• Sampled ${parcels.length} INSIDE_OMAHA parcels for spatial point-in-polygon matching test.`);

  await prisma.$disconnect();
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
