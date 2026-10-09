import { UserDTO, UserRole } from '@/types';
import { cookies } from 'next/headers';

export const DEMO_USERS: Record<UserRole, UserDTO> = {
  INVESTOR: {
    id: 'usr-investor-01',
    email: 'investor@dealbeacon.local',
    name: 'Omaha Wholesaler (Demo User)',
    role: 'INVESTOR',
  },
  ADMIN: {
    id: 'usr-admin-01',
    email: 'admin@dealbeacon.local',
    name: 'System Admin (Data Operations)',
    role: 'ADMIN',
  },
};

export const SESSION_COOKIE_NAME = 'dealbeacon_role';

/**
 * Retrieves current active user session based on application role.
 * Structured so that switching to NextAuth / Supabase Auth / Clerk requires modifying only this file.
 */
export async function getCurrentUser(): Promise<UserDTO> {
  try {
    const cookieStore = await cookies();
    const roleCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value as UserRole | undefined;
    if (roleCookie && (roleCookie === 'ADMIN' || roleCookie === 'INVESTOR')) {
      return DEMO_USERS[roleCookie];
    }
  } catch {
    // In environments where cookies() cannot be read (e.g. non-request scopes)
  }
  return DEMO_USERS.INVESTOR;
}

export async function requireUser(): Promise<UserDTO> {
  return getCurrentUser();
}

export async function requireAdmin(): Promise<UserDTO> {
  const user = await getCurrentUser();
  if (user.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin role required');
  }
  return user;
}
