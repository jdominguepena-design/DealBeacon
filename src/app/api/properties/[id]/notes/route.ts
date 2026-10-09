import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { addPropertyNote } from '@/lib/db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    const { content } = await req.json();

    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
    }

    const note = await addPropertyNote(
      user.id,
      id,
      content,
      user.name || 'Investor'
    );

    return NextResponse.json({ success: true, note });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
