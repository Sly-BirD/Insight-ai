"""
security.py — Clerk JWT Authentication Logic
=============================================
FastAPI dependency to verify session tokens directly from Clerk's JWKS.
"""

import jwt as pyjwt
from jwt.algorithms import RSAAlgorithm
import httpx
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger
from app.core.config import settings

_http_bearer = HTTPBearer(auto_error=False)
_jwks_cache: dict = {}

async def _get_clerk_public_key(kid: str):
    """Fetch and cache Clerk's public JWKS."""
    global _jwks_cache
    if kid in _jwks_cache:
        return _jwks_cache[kid]

    publishable_key = settings.CLERK_PUBLISHABLE_KEY
    if publishable_key:
        try:
            b64 = publishable_key.split("_", 2)[-1]
            b64 += "=" * (-len(b64) % 4)
            import base64 as _b64
            frontend_api = _b64.b64decode(b64).decode("utf-8").rstrip("$\x00")
            jwks_url = f"https://{frontend_api}/.well-known/jwks.json"
        except Exception:
            jwks_url = "https://clerk.accounts.dev/.well-known/jwks.json"
    else:
        jwks_url = "https://clerk.accounts.dev/.well-known/jwks.json"

    logger.debug(f"[auth] Fetching JWKS from {jwks_url}")
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=5.0)
        resp.raise_for_status()
        jwks = resp.json()

    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            public_key = RSAAlgorithm.from_jwk(key_data)
            _jwks_cache[kid] = public_key
            return public_key

    raise ValueError(f"No JWKS key found for kid={kid!r}")

async def require_auth(
    credentials: HTTPAuthorizationCredentials = Security(_http_bearer),
) -> dict:
    """Dependency that verifies a Clerk session JWT."""
    if not settings.CLERK_SECRET_KEY:
        logger.warning("[auth] CLERK_SECRET_KEY not set — skipping auth check")
        return {"sub": "dev"}

    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing Bearer token.")

    token = credentials.credentials
    try:
        unverified_header = pyjwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise HTTPException(status_code=401, detail="JWT is missing kid header.")

        public_key = await _get_clerk_public_key(kid)

        claims = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        logger.debug(f"[auth] Verified token for sub={claims.get('sub')}")
        return claims

    except HTTPException:
        raise
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session token has expired.")
    except pyjwt.InvalidTokenError as exc:
        logger.warning(f"[auth] Invalid JWT: {exc}")
        raise HTTPException(status_code=401, detail="Invalid session token.")
    except Exception as exc:
        logger.error(f"[auth] Token verification error: {exc}")
        raise HTTPException(status_code=401, detail="Authentication error.")

def get_user_id(claims: dict) -> str:
    """Extract user ID safely."""
    return claims.get("sub", "shared")
