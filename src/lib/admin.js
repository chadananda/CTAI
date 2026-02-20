// Admin authorization helper
export function requireAdmin(locals) {
  const env = locals.runtime?.env;
  const user = locals.user;
  if (!user) return { authorized: false, status: 401, error: 'Authentication required' };
  if (!env?.SITE_ADMIN_EMAIL || user.email !== env.SITE_ADMIN_EMAIL) {
    return { authorized: false, status: 403, error: 'Admin access required' };
  }
  return { authorized: true, user };
}
