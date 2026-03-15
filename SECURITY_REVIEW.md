# Security Review

Ranked list of major and moderate issues identified in this repository.

## Critical

1. **Default admin credentials automatically provisioned** — `app/main.py` lines 281-286, 847-859. The app creates an `admin` user with a hard-coded default password (`changeme`; `.env.example` ships the same value) and leaves those credentials active unless operators override environment variables. Anyone who can reach the service can authenticate as admin with the published defaults.

## High

1. **Session cookies can be forged with the public defaults** — `app/main.py` lines 289-291 and 313-318. When `MATRIX_AUTH_SECRET` is unset, the session-signing secret is derived directly from the (default) username/password, making the HMAC trivially reproducible. Attackers can mint arbitrary admin session cookies without needing the login flow.
2. **Insecure auth cookie flags enable interception** — `app/main.py` lines 883-888. The login response sets the session cookie with `secure=False` and no expiration, so credentials are sent over plain HTTP and can be replayed indefinitely if intercepted.
3. **CORS wide open with credentialed requests and no CSRF defenses** — `app/main.py` lines 272-278 and 817-829. All origins, headers, and methods are allowed with `allow_credentials=True`, and no CSRF tokens are enforced. A malicious site can coerce authenticated browsers into performing state-changing actions against the API.

## Moderate

1. **Database passwords exposed to clients** — `app/main.py` lines 473-489 and 1700-1739. The helper `serialize_db_connection`, used by the `/db-connections` endpoints (list/create/update/activate), includes `postgres_password`, so those responses return plaintext database credentials to any caller with session access (including via the overly permissive CORS policy noted in High #3), risking credential leakage.
