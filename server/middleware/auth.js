import { auth } from 'express-oauth2-jwt-bearer';
import jwt from 'jsonwebtoken';

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;

// Auth is configured if we have a domain AND either an API audience or a client ID.
// When no audience is set, the client sends the ID token (aud = client ID) instead of
// an access token, so we validate against the client ID.
export const isAuthConfigured = Boolean(AUTH0_DOMAIN && (AUTH0_AUDIENCE || AUTH0_CLIENT_ID));

let jwtCheck = null;
if (isAuthConfigured) {
  jwtCheck = auth({
    audience: AUTH0_AUDIENCE || AUTH0_CLIENT_ID,
    issuerBaseURL: `https://${AUTH0_DOMAIN}/`,
    tokenSigningAlg: 'RS256',
  });
}

/**
 * Validates the JWT bearer token. If Auth0 is not configured, passes through
 * (dev mode — no auth required).
 */
export function requireAuth(req, res, next) {
  if (!isAuthConfigured) return next();
  jwtCheck(req, res, next);
}

/**
 * Decodes the token and attaches user info to req.user.
 * Must be called after requireAuth (which already validated the token).
 * In dev mode, sets req.user to null.
 */
export function extractUser(req, res, next) {
  if (!isAuthConfigured) {
    req.user = null;
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token);
    req.user = {
      sub: decoded.sub,
      email: decoded.email || decoded[`https://${AUTH0_DOMAIN}/email`],
      name: decoded.name || decoded[`https://${AUTH0_DOMAIN}/name`],
      picture: decoded.picture || decoded[`https://${AUTH0_DOMAIN}/picture`],
    };
  } catch {
    req.user = null;
  }

  next();
}
