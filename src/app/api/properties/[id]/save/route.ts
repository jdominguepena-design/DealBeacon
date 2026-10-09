import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { toggleSaveProperty, updateSavedPropertyStatus } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const body = await req.json().catch(() => ({}));

    if (body.action === 'UPDATE_STATUS') {
      const record = await updateSavedPropertyStatus(
        user.id,
        id,
        body.status,
        body.priority
      );
      return NextResponse.json({ success: true, record });
    }

    const result = await toggleSaveProperty(
      user.id,
      id,
      body.status || 'NEW',
      body.priority || 'NORMAL'
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
