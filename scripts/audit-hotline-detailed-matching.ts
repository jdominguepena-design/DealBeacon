import { PrismaClient } from '@prisma/client';
import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

const prisma = new PrismaClient();

async function runDetailedMatchingAudit() {
  console.log('=== STAGE 12A.1 PART 2: MATCHING LOGIC & SPATIAL FEASIBILITY ===\n');

  // Load all 2,839 inside Omaha parcels with geometry and address
  console.log('Loading all 2,839 eligible Omaha parcels into spatial memory...');
  const parcels = await prisma.property.findMany({
    where: { municipalJurisdiction: 'INSIDE_OMAHA' },
    select: {
      id: true,
      parcelId: true,
      address: true,
      hasAuthoritativeAddress: true,
      geometryGeoJson: true,
      latitude: true,
      longitude: true,
    }
  });

  // Index parcels by normalized address
  const parcelAddressMap = new Map<string, string[]>(); // normalizedAddr -> parcelIds
  const parcelPolygons: Array<{ id: string; parcelId: string; address: string; feature: Feature<Polygon | MultiPolygon> }> = [];

  function normalizeAddr(addr: string | null | undefined): string {
    if (!addr) return '';
    return addr
      .toUpperCase()
      .replace(/[.,#]/g, '')
      .replace(/\bSTREET\b/g, 'ST')
      .replace(/\bAVENUE\b/g, 'AVE')
      .replace(/\bBOULEVARD\b/g, 'BLVD')
      .replace(/\bDRIVE\b/g, 'DR')
      .replace(/\bROAD\b/g, 'RD')
      .replace(/\bLANE\b/g, 'LN')
      .replace(/\bCOURT\b/g, 'CT')
      .replace(/\bCIRCLE\b/g, 'CIR')
      .replace(/\bNORTH\b/g, 'N')
      .replace(/\bSOUTH\b/g, 'S')
      .replace(/\bEAST\b/g, 'E')
      .replace(/\bWEST\b/g, 'W')
      .replace(/\s+/g, ' ')
      .trim();
  }

  for (const p of parcels) {
    if (p.hasAuthoritativeAddress && p.address) {
      const norm = normalizeAddr(p.address);
      if (!parcelAddressMap.has(norm)) {
        parcelAddressMap.set(norm, []);
      }
      parcelAddressMap.get(norm)!.push(p.id);
    }

    if (p.geometryGeoJson) {
      try {
        const poly = turf.feature(p.geometryGeoJson as any);
        if (poly.geometry.type === 'Polygon' || poly.geometry.type === 'MultiPolygon') {
          parcelPolygons.push({
            id: p.id,
            parcelId: p.parcelId,
            address: p.address,
            feature: poly as Feature<Polygon | MultiPolygon>
          });
        }
      } catch (e) {
        // invalid geojson
      }
    }
  }

  console.log(`• Indexed ${parcelAddressMap.size} unique normalized parcel addresses.`);
  console.log(`• Valid polygon geometries available: ${parcelPolygons.length} of ${parcels.length} parcels.\n`);

  // Load all 2,459 Hotline reports
  const reports = await prisma.hotlineReport.findMany({
    select: {
      id: true,
      requestId: true,
      reportCategory: true,
      problemType: true,
      locationText: true,
      latitude: true,
      longitude: true,
      status: true,
    }
  });

  // Evaluate matching across 4 tiers:
  // Tier 1: Exact Address Match + Spatial Confirmation (Point Inside Parcel Polygon)
  // Tier 2: Address Match Only (Point slightly outside polygon e.g. curbside/geocoded)
  // Tier 3: Spatial Polygon Containment Only (Address discrepancy or non-standard)
  // Tier 4: Right-of-Way / Infrastructure Exclusion (Pothole, traffic, intersection)
  // Tier 5: Ambiguous / Unmatched

  let exactMatchCount = 0;
  let spatialOnlyCount = 0;
  let addressOnlyCount = 0;
  let infrastructureExclusionCount = 0;
  let intersectionOrNoAddressCount = 0;
  let unmatchedCount = 0;

  const samples: {
    exact: any[];
    spatialOnly: any[];
    addressOnly: any[];
    infrastructure: any[];
    intersection: any[];
  } = {
    exact: [],
    spatialOnly: [],
    addressOnly: [],
    infrastructure: [],
    intersection: [],
  };

  const intersectionRegex = /\b(&|AND|\/|INTERSECTION|BETWEEN|CORNER|APPROX|NEAR|BLOCK OF|ROW|RAMP|HWY|HIGHWAY|INTERSTATE)\b/i;

  for (const r of reports) {
    const loc = r.locationText || '';
    const isIntersection = intersectionRegex.test(loc);
    const cat = r.reportCategory || '';
    const isInfra = /pothole|road_signs|traffic|street/i.test(cat);

    if (isInfra) {
      infrastructureExclusionCount++;
      if (samples.infrastructure.length < 3) {
        samples.infrastructure.push({
          requestId: r.requestId,
          category: r.reportCategory,
          problem: r.problemType,
          location: loc
        });
      }
      continue;
    }

    if (isIntersection) {
      intersectionOrNoAddressCount++;
      if (samples.intersection.length < 3) {
        samples.intersection.push({
          requestId: r.requestId,
          category: r.reportCategory,
          problem: r.problemType,
          location: loc
        });
      }
      continue;
    }

    // Try Address Match
    // Hotline addresses often end with ", Omaha, NE, 68102"
    let cleanReportAddr = loc.split(',')[0].trim();
    const normReportAddr = normalizeAddr(cleanReportAddr);

    const matchingParcelIds = parcelAddressMap.get(normReportAddr) || [];

    // Try Spatial Point-in-Polygon
    let containingParcel: { id: string; parcelId: string; address: string } | null = null;
    if (r.latitude && r.longitude) {
      const pt = turf.point([r.longitude, r.latitude]);
      for (const p of parcelPolygons) {
        if (turf.booleanPointInPolygon(pt, p.feature)) {
          containingParcel = p;
          break;
        }
      }
    }

    if (matchingParcelIds.length === 1 && containingParcel && matchingParcelIds[0] === containingParcel.id) {
      exactMatchCount++;
      if (samples.exact.length < 3) {
        samples.exact.push({
          requestId: r.requestId,
          category: r.reportCategory,
          problem: r.problemType,
          reportLoc: loc,
          matchedParcelPin: containingParcel.parcelId,
          parcelAddress: containingParcel.address
        });
      }
    } else if (matchingParcelIds.length === 1) {
      addressOnlyCount++;
      if (samples.addressOnly.length < 3) {
        samples.addressOnly.push({
          requestId: r.requestId,
          category: r.reportCategory,
          problem: r.problemType,
          reportLoc: loc,
          matchedParcelId: matchingParcelIds[0],
          spatialContained: containingParcel ? containingParcel.parcelId : 'NONE'
        });
      }
    } else if (containingParcel) {
      spatialOnlyCount++;
      if (samples.spatialOnly.length < 3) {
        samples.spatialOnly.push({
          requestId: r.requestId,
          category: r.reportCategory,
          problem: r.problemType,
          reportLoc: loc,
          containedInPin: containingParcel.parcelId,
          parcelAddress: containingParcel.address
        });
      }
    } else {
      unmatchedCount++;
    }
  }

  console.log('RESULTS OF FEASIBILITY MATCHING AUDIT:');
  console.log(`• Total Hotline Reports Audited: ${reports.length}`);
  console.log(`• Excluded Infrastructure (Potholes/Roads/Signals): ${infrastructureExclusionCount} (${((infrastructureExclusionCount / reports.length) * 100).toFixed(1)}%)`);
  console.log(`• Excluded Intersections / Cross-Streets / ROW: ${intersectionOrNoAddressCount} (${((intersectionOrNoAddressCount / reports.length) * 100).toFixed(1)}%)`);
  console.log(`• Exact Match (Address + Spatial Polygon Containment): ${exactMatchCount}`);
  console.log(`• Address Match Only (Point geocoded to curb or slight offset): ${addressOnlyCount}`);
  console.log(`• Spatial Polygon Match Only (Point inside parcel polygon, non-exact address text): ${spatialOnlyCount}`);
  console.log(`• Unmatched / Outside Current Pilot Parcel Extent: ${unmatchedCount}\n`);

  console.log('SAMPLE RECORDS (PRIVACY-SAFE):');
  console.log('--- A. Infrastructure Exclusions ---');
  console.log(JSON.stringify(samples.infrastructure, null, 2));
  console.log('\n--- B. Intersection / Cross-Street Exclusions ---');
  console.log(JSON.stringify(samples.intersection, null, 2));
  console.log('\n--- C. Exact Dual-Verified Matches (Address + Polygon) ---');
  console.log(JSON.stringify(samples.exact, null, 2));
  console.log('\n--- D. Address Match with Curbside Offset ---');
  console.log(JSON.stringify(samples.addressOnly, null, 2));
  console.log('\n--- E. Spatial Polygon Containment with Address Variance ---');
  console.log(JSON.stringify(samples.spatialOnly, null, 2));

  await prisma.$disconnect();
}

runDetailedMatchingAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
