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
 * Cookie-based role elevation is strictly permitted ONLY during local development (NODE_ENV === 'development').
 * In production or test environments, cookie-based admin escalation fails closed to INVESTOR.
 */
export async function getCurrentUser(): Promise<UserDTO> {
  // Enforce local development only for demo cookie-based role switching
  const isLocalDev = process.env.NODE_ENV === 'development';

  if (isLocalDev) {
    try {
      const cookieStore = await cookies();
      const roleCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value as UserRole | undefined;
      if (roleCookie && (roleCookie === 'ADMIN' || roleCookie === 'INVESTOR')) {
        return DEMO_USERS[roleCookie];
      }
    } catch {
      // In environments where cookies() cannot be read (e.g. non-request scopes)
    }
  }

  // Fail-closed default for non-development or unset sessions
  return DEMO_USERS.INVESTOR;
}

export async function requireUser(): Promise<UserDTO> {
  return getCurrentUser();
}

export async function requireAdmin(): Promise<UserDTO> {
  const isLocalDev = process.env.NODE_ENV === 'development';
  if (!isLocalDev) {
    throw new Error('Unauthorized: Administrative operations are disabled outside local development.');
  }

  const user = await getCurrentUser();
  if (user.role !== 'ADMIN') {
    throw new Error('Unauthorized: Admin role required.');
  }
  return user;
}

