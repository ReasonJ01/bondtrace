# Bondtrace Flow Spec v1 (Postman-lite, JSON)

## 0) Authoring profile: keep it minimal

For day-to-day authoring, prefer a **minimal flow JSON**:

- Do not embed `local/dev/sandbox` blocks in the flow file.
- Pass exactly one env file per run (`--env-file .env.dev`).
- Keep only:
  - `authProfiles`
  - `steps` (`request`, `wait`, `waitForContinue`)
  - variable extraction (`set`)

Use richer structures only for import/conversion compatibility.

This document defines a concrete, **Postman-lite** flow format for authoring request chains in **JSON** and executing directly into Bondtrace `tape.json` output.

## 1) Goals

- Replace Postman collection + environment export for common recording workflows.
- Keep familiar concepts:
  - environments
  - variables
  - pre/post request hooks
  - `{{ }}` templating
- Support two auth modes in one run:
  - OAuth2 client credentials token
  - browser-redirect user token
- Keep output fully compatible with existing Bondtrace tape format.

## 2) File set

A runnable setup uses:

1. `flow.v1.json` (requests, templating, variable hooks)
2. `.env.local` / `.env.dev` / `.env.sandbox` (environment-specific config + secrets)
3. optional OpenAPI source (`openapi.yaml`) for scaffolding/linting

## 3) Runtime commands

```bash
# Validate flow + env wiring (warn by default)
bondtrace doctor flow.v1.json -n local --env-file .env.local

# Execute flow and record tape
bondtrace run flow.v1.json -n dev --env-file .env.dev --out tape.json
```

`-n` is optional metadata; primary runtime selection is via `--env-file` (single environment per run).


## 3.1) Preflight key resolution (required)

Before executing requests, the runner evaluates auth profiles and template usage to compute required `.env` keys up front for the selected env file.

- If any required key is missing, `bondtrace run` fails before making network calls.
- `bondtrace doctor` reports the same list as warnings (single warning severity).
- Required keys include:
  - environment `baseUrlVar`
  - all keys for auth profiles referenced by `serviceToken`/`userToken`
  - any explicit `{{env.KEY}}` references in flow templates

## 4) Flow JSON schema shape

```json
{
  "version": 1,
  "kind": "bondtrace-flow",
  "name": "customer-onboarding-demo",
  "openapi": {
    "sources": ["./openapi/customer-api.yaml"]
  },
  "environments": {
    "local": {
      "baseUrlVar": "BASE_URL",
      "auth": {
        "serviceToken": "clientCreds",
        "userToken": "browserUserPkce"
      }
    },
    "dev": {
      "baseUrlVar": "BASE_URL",
      "auth": {
        "serviceToken": "clientCreds",
        "userToken": "browserUserImplicit"
      }
    },
    "sandbox": {
      "baseUrlVar": "BASE_URL",
      "auth": {
        "serviceToken": "clientCreds",
        "userToken": "browserUserPkce"
      }
    }
  },
  "authProfiles": {
    "clientCreds": {
      "type": "oauth2-client-credentials",
      "tokenUrlVar": "OAUTH_TOKEN_URL",
      "clientIdVar": "CLIENT_ID",
      "clientSecretVar": "CLIENT_SECRET",
      "scopes": ["api.read", "api.write"]
    },
    "browserUserPkce": {
      "type": "oauth2-browser-redirect",
      "mode": "authorization-code-pkce",
      "authorizeUrlVar": "AUTHORIZE_URL",
      "tokenUrlVar": "TOKEN_URL",
      "clientIdVar": "BROWSER_CLIENT_ID",
      "redirectUriVar": "REDIRECT_URI",
      "scopes": ["openid", "profile"],
      "tokenResponsePath": "$.access_token"
    },
    "browserUserImplicit": {
      "type": "oauth2-browser-redirect",
      "mode": "implicit",
      "authorizeUrlVar": "AUTHORIZE_URL",
      "clientIdVar": "BROWSER_CLIENT_ID",
      "redirectUriVar": "REDIRECT_URI",
      "scopes": ["openid", "profile"],
      "tokenResponsePath": "$.access_token"
    }
  },
  "defaults": {
    "headers": {
      "Accept": "application/json",
      "Content-Type": "application/json"
    }
  },
  "variables": [
    { "name": "traceId", "value": "{{fn.uuid()}}" }
  ],
  "redaction": {
    "auto": true,
    "keys": ["clientSecret", "password"],
    "tokenFields": true
  },
  "flow": [
    {
      "id": "createCustomer",
      "operationId": "createCustomer",
      "auth": "serviceToken",
      "pre": {
        "set": {
          "email": "{{fn.email('bondtrace.dev')}}",
          "firstName": "{{fn.firstName()}}",
          "lastName": "{{fn.lastName()}}"
        }
      },
      "request": {
        "method": "POST",
        "path": "/customers",
        "headers": {
          "X-Trace-Id": "{{vars.traceId}}"
        },
        "body": {
          "firstName": "{{vars.firstName}}",
          "lastName": "{{vars.lastName}}",
          "email": "{{vars.email}}"
        }
      },
      "post": {
        "set": {
          "customerId": "{{response.body.id}}"
        }
      }
    },
    {
      "type": "wait",
      "seconds": 5,
      "label": "Wait for async customer provisioning"
    },
    {
      "type": "waitForContinue",
      "label": "Pause recording until presenter is ready",
      "buttonText": "Continue recording"
    },
    {
      "id": "fetchCustomerAsUser",
      "operationId": "getCustomer",
      "auth": "userToken",
      "request": {
        "method": "GET",
        "path": "/customers/{{vars.customerId}}"
      }
    }
  ]
}
```

## 5) Environment model

- Use one `.env` for the run (for example `.env.dev`).
- Flow files can omit multi-environment blocks entirely.
- Selected `.env` provides URLs and credentials.

### Required `.env.*` keys

```dotenv
BASE_URL=https://...

# Service token (client credentials)
OAUTH_TOKEN_URL=https://.../oauth/token
CLIENT_ID=...
CLIENT_SECRET=...

# Browser redirect token (auth code + PKCE)
AUTHORIZE_URL=https://.../authorize
TOKEN_URL=https://.../oauth/token
BROWSER_CLIENT_ID=...
REDIRECT_URI=http://localhost:7777/callback
```

## 6) Auth behavior

### `oauth2-client-credentials`

- Acquire token before first request needing `serviceToken`.
- Cache per run/profile/scope.
- No token refresh in v1; token is acquired once per run.

### `oauth2-browser-redirect`

Supports both browser modes:

- `mode: authorization-code-pkce`
  - Start local callback listener (for `REDIRECT_URI`)
  - Launch browser to authorize endpoint
  - Exchange auth code at `TOKEN_URL` using PKCE
- `mode: implicit`
  - Start local callback listener
  - Launch browser and capture token from redirect fragment

In both cases, extracted token is cached as `userToken` for requests requiring `auth: userToken`.

This ensures both required bearer tokens are available in the same run.

- Browser mode is selected by environment via the mapped `userToken` profile (`browserUserPkce` or `browserUserImplicit`).
- There is exactly one interactive `userToken` per run.

## 7) Templating and variables

Supported template roots:

- `{{vars.<name>}}` mutable run variables
- `{{env.<KEY>}}` resolved `.env` key
- `{{response.body.<path>}}`
- `{{response.headers.<Header-Name>}}`
- `{{fn.*}}` helper functions

## 8) Hooks model (declarative-only)

No arbitrary JavaScript in v1.

- `pre.set` writes variables before request
- `post.set` writes variables after response
- expressions may read `vars`, `env`, `response`, and `fn`


## 9) Wait steps between requests

Flow supports two non-request steps that can appear anywhere inside `flow`:

- `{"type": "wait", "seconds": <n>}`
  - sleeps for `n` seconds before continuing
- `{"type": "waitForContinue", "label": "...", "buttonText": "..."}`
  - pauses recording until user presses continue in recorder UI/CLI prompt

Both steps are recorded in tape timeline metadata so playback reflects presenter pacing.

## 10) Helper functions (`fn`)

- `fn.uuid()`
- `fn.timestamp()`
- `fn.unix()`
- `fn.randomInt(min,max)`
- `fn.randomString(length)`
- `fn.firstName()`
- `fn.lastName()`
- `fn.email(domain?)`
- `fn.phone()`
- `fn.pick(array)`

## 11) Redaction and recording

- Tape output remains compatible with existing player.
- Variable snapshots are captured per step.
- Sensitive values are **auto-redacted** in logs and recorded metadata using known keys only:
  - `redaction.keys`: exactly `clientSecret` and `password`
  - token redaction for known auth outputs and Authorization headers when `redaction.tokenFields` is `true`

## 12) Validation (`doctor`)

`bondtrace doctor` emits a single warning type (no severity levels):

- missing env keys
- unresolved templates
- undefined variables
- auth profile mismatches
- OpenAPI mismatches


## 13) Sample flow

See `samples/flow.v1.json` for a complete example.


## 14) Learn from Postman export format

A Postman collection export (v2.1) is JSON with a few stable structures we should reuse where it helps:

- `info` metadata (`name`, schema URL, description)
- `item[]` tree of folders + requests
- request object with `method`, `header[]`, `url` (raw + parsed), and `body`
- `event[]` hooks (`prerequest`, `test`) as script arrays
- collection-level / environment-level variables (`variable[]`)
- auth definitions (`auth.type` + typed config arrays)

### What this suggests for Bondtrace

Use a **Postman-shaped request envelope** to minimize translation cost, but keep Bondtrace-specific execution controls declarative.

#### Recommended hybrid shape

```json
{
  "version": 1,
  "kind": "bondtrace-flow",
  "info": {
    "name": "customer-onboarding-demo",
    "description": "Recorded flow for demo"
  },
  "variable": [
    { "key": "traceId", "value": "{{fn.uuid()}}", "scope": "run" }
  ],
  "item": [
    {
      "name": "Create customer",
      "id": "createCustomer",
      "authRef": "serviceToken",
      "request": {
        "method": "POST",
        "header": [
          { "key": "Content-Type", "value": "application/json" }
        ],
        "url": {
          "raw": "{{env.BASE_URL}}/customers"
        },
        "body": {
          "mode": "raw",
          "raw": "{\"email\":\"{{vars.email}}\"}",
          "options": { "raw": { "language": "json" } }
        }
      },
      "bt": {
        "pre": { "set": { "email": "{{fn.email('bondtrace.dev')}}" } },
        "post": { "set": { "customerId": "{{response.body.id}}" } }
      }
    },
    {
      "name": "Wait for backend",
      "bt": { "step": { "type": "wait", "seconds": 5 } }
    },
    {
      "name": "Manual continue",
      "bt": { "step": { "type": "waitForContinue", "buttonText": "Continue" } }
    }
  ]
}
```

- `request` stays familiar to Postman users/importers.
- `bt` namespace contains Bondtrace-only behavior (`pre/post`, wait steps, auth refs, redaction hints).
- We avoid Postman JS scripting while preserving intent with declarative `pre/post.set`.

### Field mapping (Postman -> Bondtrace)

- `info.name` -> `info.name` (same)
- `item[].request` -> `item[].request` (same envelope)
- `item[].event[prerequest|test]` -> `item[].bt.pre` / `item[].bt.post` (declarative translation)
- `variable[]` + environment variables -> `variable[]` + `.env.*` resolution
- `auth` blocks -> `authProfiles` + environment `auth` mapping
- folder hierarchy (`item` recursion) -> optional flatten to execution order (or preserve with `folder` tags)

### Why this is better than a fully custom shape

- Easier `postman -> bondtrace` converter with less lossy transforms.
- AI can consume existing Postman exports and produce near-1:1 Bondtrace JSON.
- Teams can inspect/edit requests in a familiar structure while still gaining Bondtrace recording features.

### Converter guidance

`bondtrace convert postman collection.json -e env.json > flow.v1.json` should:

1. Copy request envelope nearly as-is.
2. Convert known auth types into `authProfiles` and `authRef` links.
3. Convert simple script patterns (set/get variable, response JSON extraction) into `bt.pre/post.set`.
4. Emit warnings for unsupported script logic under the single warning type.



Flow format alternatives: see `docs/flow-format-options.md`.


## 15) `.http` authoring profile

In addition to JSON flows, Bondtrace should accept `.http` files in `requests/` as first-class input.

Full grammar and parser contract: see `docs/http-format-spec.md`.

### File format

```http
METHOD {{base_url}}/path
Header-Name: value
Authorization: Bearer {{auth_token}}

{
  "optional": "request body",
  "unique_id": "{{$uuid}}"
}
```

- First line: `METHOD URL`
- Subsequent lines before first blank line: headers
- Everything after first blank line: optional body

### Directives

- `@name <stepId>`: step identifier
- `@auth <token_var>`: token variable to use (`service_token` or `user_token`)
- `@set <var>=<expr>`: post-response variable capture
- `@wait <seconds>`: wait step between requests
- `@wait_for_continue <label>`: manual continue step between requests

Use `###` as request/step separator.

### Variable interpolation

- `{{var}}` resolves Bondtrace runtime variables in `.http` files.
- `${ENV_VAR}` resolves OS env vars while loading `.env` files.

These are intentionally different systems:

- `.env` loading stage: `${ENV_VAR}`
- request rendering stage: `{{var}}`

### Built-in random helpers for `.http`

Support Postman-style helper tokens:

- `{{$uuid}}`
- `{{$random_string}}`
- `{{$random_int}}`

These use the same helper runtime used by JSON flows and are captured in variable snapshots.

### Compatibility model

`.http` inputs are executed directly and written into the existing `tape.json` schema, so recording output and player compatibility remain unchanged.

