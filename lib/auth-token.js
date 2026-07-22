import { rolesOf } from './perm.js';

// JWT sessions previously kept the role snapshot from the moment a person signed in.
// Refreshing the token from the persisted user makes multi-role grants and revocations
// effective without asking an administrator to rotate NEXTAUTH_SECRET for everyone.
export function syncTokenAccess(token, user) {
  const next = { ...token };
  if (!user || (user.status && user.status !== 'active')) {
    next.accessDisabled = true;
    next.role = null;
    next.roles = [];
    next.teamId = null;
    return next;
  }

  next.accessDisabled = false;
  next.uid = user.id;
  next.email = user.email || next.email;
  next.name = user.name || next.name;
  next.role = user.role;
  next.roles = rolesOf(user);
  next.teamId = user.teamId || null;
  next.userType = user.userType || 'employee';
  return next;
}

export function applyTokenAccessToSession(session, token) {
  if (!session?.user) return session;
  session.user.id = token.uid;
  session.user.role = token.role || null;
  session.user.roles = token.accessDisabled ? [] : rolesOf({ roles: token.roles, role: token.role });
  session.user.teamId = token.teamId || null;
  session.user.userType = token.userType || 'employee';
  session.user.accessDisabled = Boolean(token.accessDisabled);
  return session;
}
