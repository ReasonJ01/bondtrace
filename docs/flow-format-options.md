# Flow Format Options (Focused Brainstorm)

Goal: reduce flow-file noise while keeping enough structure for deterministic recording.

## Option 1: Minimal Native JSON (recommended)

Keep the flow file tiny and push environment details to `.env` + CLI flags.

```json
{
  "version": 1,
  "name": "customer-demo",
  "authProfiles": {
    "service": {
      "type": "oauth2-client-credentials",
      "tokenUrlVar": "OAUTH_TOKEN_URL",
      "clientIdVar": "CLIENT_ID",
      "clientSecretVar": "CLIENT_SECRET"
    },
    "user": {
      "type": "oauth2-browser-redirect",
      "mode": "implicit",
      "authorizeUrlVar": "AUTHORIZE_URL",
      "clientIdVar": "BROWSER_CLIENT_ID",
      "redirectUriVar": "REDIRECT_URI",
      "tokenResponsePath": "$.access_token"
    }
  },
  "steps": [
    {
      "id": "createCustomer",
      "auth": "service",
      "request": {
        "method": "POST",
        "url": "{{env.BASE_URL}}/customers",
        "body": {
          "email": "{{fn.email('bondtrace.dev')}}"
        }
      },
      "set": {
        "customerId": "{{response.body.id}}"
      }
    },
    {
      "type": "wait",
      "seconds": 5
    },
    {
      "type": "waitForContinue"
    },
    {
      "id": "getCustomer",
      "auth": "user",
      "request": {
        "method": "GET",
        "url": "{{env.BASE_URL}}/customers/{{vars.customerId}}"
      }
    }
  ]
}
```

### Why this is good

- One environment per run (via `--env-file`) means no local/dev/sandbox duplication in JSON.
- Very easy for humans and AI to author.
- Keeps only high-value fields: request, auth choice, variable extraction, wait controls.

## Option 2: Postman-shaped + `bt` extension

Use Postman-like request envelope (`item`, `request`, `url`, `header`) and put Bondtrace features under `bt`.

### Why this is good

- Easy migration from exported collections.

### Tradeoff

- Still carries Postman verbosity; not as clean as minimal native JSON.

## Option 3: NDJSON step stream

Each line is a step (`request`, `wait`, `waitForContinue`) with a shared header file for auth.

### Why this is good

- Great diffs and append-only authoring.

### Tradeoff

- Harder for manual editing/validation tooling.

## Option 4: Split files (base flow + auth pack)

- `flow.steps.json` contains only step logic.
- `flow.auth.json` contains auth profiles.

### Why this is good

- Keeps frequently-edited flow steps small.

### Tradeoff

- More file coordination overhead.


## Option 5: `.http` request files (coworker-style)

Use one or more plain-text `.http` files under `requests/` with optional control directives.

```http
@name createCustomer
@auth service_token
POST {{base_url}}/v1.1/customers
Content-Type: application/json
Authorization: Bearer {{service_token}}

{
  "externalRef": "{{$random_string}}",
  "lastName": "Tester {{$random_int}}"
}

###
@wait 5

###
@wait_for_continue Continue demo
```

### Why this is good

- Extremely readable for humans.
- Very easy to generate with AI.
- Keeps files small and close to raw HTTP semantics.

### Tradeoff

- Needs a parser for directives (`@auth`, `@wait`, `@wait_for_continue`, etc.).
- Slightly less structured than JSON for machine validation.

## Recommendation

Use **Option 1 (Minimal Native JSON)** or **Option 5 (`.http`)** for v1:

- single run environment via `.env` file,
- two auth tokens per run (`service_token`, `user_token`),
- request + set + wait primitives only,
- known-key redaction handled by runtime config defaults.

Keep a converter for Postman import, but do not make Postman-shaped JSON the primary authoring format.
For teams that prefer raw HTTP authoring, support `.http` as a first-class input that compiles to the same internal flow model.
