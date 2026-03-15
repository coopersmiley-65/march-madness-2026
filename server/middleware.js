/**
 * Auth Middleware – shared across route files
 */
export function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}

export function requireAdmin(req, res, next) {
    if (!req.session.user || !req.session.user.is_admin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}
