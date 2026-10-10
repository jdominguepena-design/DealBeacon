import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    {
      error: 'Adding property notes is disabled in public records exploration mode. This feature is not yet available.',
      code: 'FEATURE_DISABLED',
    },
    { status: 501 }
  );
}

