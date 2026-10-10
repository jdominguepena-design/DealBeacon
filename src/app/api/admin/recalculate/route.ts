import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'Scoring recalculation is disabled while Douglas County public record validation is active.',
      code: 'FEATURE_DISABLED',
    },
    { status: 501 }
  );
}

