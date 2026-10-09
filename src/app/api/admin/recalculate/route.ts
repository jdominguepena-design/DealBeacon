import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { recalculatePropertyScores } from '@/lib/db';

export async function POST() {
  try {
    await requireAdmin();
    const result = await recalculatePropertyScores();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
}
