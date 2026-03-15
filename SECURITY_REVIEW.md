# Security Review

Ranked list of major and moderate issues identified in this repository.

## Critical

1. **Default admin credentials auto-provisioned** — `app/main.py` lines 281-286, 847-859. The app creates an `admin` user with a hard-coded default password (`changeme`/`change-me`) and uses it unless operators override environment variables. Anyone who can reach the service can authenticate as admin with the published defaults.

## High

2. **Session cookies are forgeable with the public defaults** — `app/main.py` lines 289-291 and 313-318. When `MATRIX_AUTH_SECRET` is unset, the session-signing secret is derived directly from the (default) username/password, making the HMAC trivially reproducible. Attackers can mint arbitrary admin session cookies without needing the login flow.
3. **Insecure auth cookie flags enable interception** — `app/main.py` lines 883-888. The login response sets the session cookie with `secure=False` and no expiration, so credentials are sent over plain HTTP and can be replayed indefinitely if intercepted.
4. **CORS wide open with credentialed requests and no CSRF defenses** — `app/main.py` lines 272-278 and 817-829. All origins, headers, and methods are allowed with `allow_credentials=True`, and no CSRF tokens are enforced. A malicious site can coerce authenticated browsers into performing state-changing actions against the API.

## Moderate

5. **Database passwords exposed to clients** — `app/main.py` lines 473-489 and 1700-1740. The `serialize_db_connection` response includes `postgres_password`, so API calls return plaintext database credentials to any caller with session access (including via the overly permissive CORS policy), risking credential leakage.
