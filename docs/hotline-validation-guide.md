# Hotline Candidate Human-Validation Guide

**Status:** Read-only review. No decision you record here is written to the database.
**Applies to:** `/admin/hotline-review` (local development, ADMIN role only) and the CSV template
produced by `npm.cmd run export:hotline-validation`.

---

## 1. What you are and are not deciding

A Hotline record is an **unverified citizen complaint**. Matching it to a parcel answers only one
question: *does the reported location plausibly correspond to this parcel?*

| You ARE assessing | You are NOT assessing |
| --- | --- |
| Whether the report location and the parcel agree geographically | Whether the owner caused, owns, or is responsible for the issue |
| Whether the complaint is about the parcel itself or about the street/public space next to it | Whether a code violation occurred (no official violations are imported) |
| How confident you are | Any score, ranking, or distress signal |

Keep **geographic consistency** and **property relevance** as two separate judgments. A report can
be geographically correct and still be irrelevant to the property (e.g. a pothole in front of it).

---

## 2. Setup

1. Start the dev server: `npm.cmd run dev`.
2. Switch the session role to **Admin** in the top navigation.
3. Open `http://localhost:3000/admin/hotline-review`. The **50-Sample** tab is selected by default.
4. Generate the CSV: `npm.cmd run export:hotline-validation`. Output:
   `testing-artifacts/hotline-validation/hotline-validation-sample-50.csv` (Git-ignored).
5. Fill in only the `reviewer_*` and `review_date` columns. Do not edit the automated columns.

---

## 3. Review procedure for each record

### Step A — Compare the Hotline location with the assessor situs
- Read `original_location_text` and `candidate_assessor_situs` side by side.
- Check house number, street name, direction (N/S/E/W), and suffix (St/Ave/Ct).
- Normalization already converts ordinals (`20th` → `20`) and suffixes. Use
  `normalized_report_address` to see exactly what was compared.
- **Red flags:** a block range (`3016-3020 S 34th St`), a different house number on the same
  street, or a unit/half-address (`1/2`, `Apt`) not present on the parcel record.

### Step B — Check the parcel geometry
- `point_in_polygon = YES` means the report coordinate falls inside the parcel boundary.
- If `NO`, read `boundary_distance_m_exact` (exact meters to the nearest parcel edge; not rounded).
  - Under ~5 m: typical curb/street-edge geocoding.
  - 5–20 m: plausible but check the street layout.
  - Over 20 m: flagged for mandatory review. Assume the point is in the street or another lot
    unless the address evidence is strong.
- Optional external check: look up the PIN on the Douglas County Assessor site. Do not record any
  owner personal details in your notes.

### Step C — Identify street or right-of-way issues
- `row_problem_type_warning = YES` means the problem type (abandoned on-street vehicle, parking,
  curb, sidewalk, pavement, signage, streetlight) normally concerns public space.
- Even with a perfect geographic match, these are usually **not property-relevant**.
- `EXCLUDED_PUBLIC_INFRASTRUCTURE` and `EXCLUDED_RIGHT_OF_WAY` rows were excluded automatically.
  Confirm the exclusion was correct; note it if a real street address was excluded by mistake.

### Step D — Record two separate judgments

`reviewer_geographic_consistency` — use one value:

| Value | Meaning |
| --- | --- |
| `CONSISTENT` | Location clearly corresponds to this parcel |
| `PLAUSIBLE` | Probably this parcel, minor doubt (e.g. curb offset, range address) |
| `INCONSISTENT` | Location points elsewhere |
| `CANNOT_DETERMINE` | Not enough information |
| `EXCLUSION_CORRECT` / `EXCLUSION_INCORRECT` | For excluded or unmatched rows |

`reviewer_property_relevance` — use one value:

| Value | Meaning |
| --- | --- |
| `PROPERTY_CONDITION` | Complaint concerns the lot or structure itself (weeds, dumping on lot, graffiti on building) |
| `PUBLIC_SPACE` | Concerns street, curb, sidewalk, on-street vehicle, public facility |
| `UNCLEAR` | Cannot tell from the category and location |
| `NOT_APPLICABLE` | No candidate parcel |

`reviewer_confidence` — `HIGH`, `MEDIUM`, or `LOW`.

### Step E — Record uncertainty instead of guessing
- If you are unsure, choose `CANNOT_DETERMINE` / `UNCLEAR` and `LOW`, and explain why in
  `reviewer_notes`.
- Never upgrade a classification because it "looks right." Never infer owner responsibility.
- Do not copy reporter names, phone numbers, or emails into notes (none are stored; keep it that way).

---

## 4. Known limitations to watch for (as of Stage 12B.3)

1. The right-of-way pattern treats `/` and `HWY` as corridor indicators. This incorrectly excluded
   at least two real addresses in the sample: `2304 1/2 S 135th Ave` (RequestID 631870) and
   `5035 NW Radial Hwy` (RequestID 632103). Mark these `EXCLUSION_INCORRECT` if you agree.
2. Several dual-evidence candidates share PIN `0313630000` (`1701 FARNAM ST`), which appears to be
   a default/civic-center address used by the Hotline system. Treat these with extra caution.
3. No map is displayed; geometry is reported as containment plus exact boundary distance.
4. All 50 records are currently **UNREVIEWED**. Automated checks are not human verification.

---

## 5. After review

Return the completed CSV for analysis. Persistence of review decisions has **not** been built and
requires separate approval.
