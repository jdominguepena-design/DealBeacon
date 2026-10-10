import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth';
import { UserRole } from '@/types';

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Role switching is disabled outside local development environment.' },
      { status: 403 }
    );
  }

  try {
    const { role } = await req.json();
    if (role !== 'INVESTOR' && role !== 'ADMIN') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const response = NextResponse.json({ success: true, role });
    response.cookies.set(SESSION_COOKIE_NAME, role as UserRole, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

