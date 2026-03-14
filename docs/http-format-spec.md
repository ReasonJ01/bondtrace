# Bondtrace `.http` Format Spec v1

This spec defines the `.http` file format used to author request flows for Bondtrace recording.

It is intentionally close to common REST-client `.http` syntax while adding small, explicit directives for flow control and variable capture.

---

## 1. Scope and goals

The `.http` format supports:

- HTTP request steps
- Wait/pause control steps between requests
- Variable interpolation (`{{var}}`) at render time
- Built-in random helper tokens (`{{$uuid}}`, `{{$random_string}}`, `{{$random_int}}`)
- Declarative post-response variable extraction

The `.http` parser executes steps directly and writes request/response results into the existing recorder `tape.json` format.

---

## 2. File discovery and ordering

- Input path may be a single file or a directory.
- If a directory is provided, load `*.http` files sorted lexicographically by relative path.
- Within each file, steps are parsed in source order.
- Final execution order is file order then step order.

Recommended layout:

```text
requests/
  01-auth.http
  02-customers.http
  03-transfers.http
```

---

## 3. Step separator

`###` on its own line separates steps.

- Separator line may include trailing spaces.
- Consecutive separators are allowed; empty segments are ignored.

Example:

```http
@name stepA
GET {{base_url}}/a

###

@name stepB
GET {{base_url}}/b
```

---

## 4. Step types

Each segment resolves to one of three step types:

1. `request`
2. `wait`
3. `waitForContinue`

Resolution rules:

- If segment contains `@wait <seconds>` and no request line -> `wait`.
- If segment contains `@wait_for_continue ...` and no request line -> `waitForContinue`.
- Otherwise, segment must contain exactly one request line -> `request`.

Invalid combinations:

- request line + `@wait` in same segment
- request line + `@wait_for_continue` in same segment
- both `@wait` and `@wait_for_continue` in same segment

---

## 5. Request step syntax

### 5.1 Request line

First non-directive line matching:

```text
<METHOD> <URL>
```

- `METHOD`: uppercase token (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, etc.)
- `URL`: raw string after first space; may contain `{{...}}`

Example:

```http
POST {{base_url}}/v1.1/customers
```

### 5.2 Headers block

All non-empty lines after request line until first blank line are headers:

```text
Header-Name: value
```

Rules:

- First `:` splits name/value
- Header names are case-insensitive
- Duplicate headers are allowed and preserved in source order
- Leading/trailing spaces around value are trimmed

### 5.3 Body block

Everything after the first blank line after headers is request body (optional).

Rules:

- Body is stored as raw text exactly as authored (minus trailing final newline normalization)
- Parser does not require JSON body; any content type is allowed
- If `Content-Type: application/json`, runtime may validate JSON in `doctor` mode (warning only)

---

## 6. Directives

Directives are lines that begin with `@` in column 1.

General form:

```text
@directive value...
```

Supported directives in v1:

### 6.1 `@name`

```text
@name <step_id>
```

- Optional but recommended
- If absent, runtime auto-generates (`step_001`, etc.)
- Must be unique after generation; duplicate names are warnings and auto-suffixed

### 6.2 `@auth`

```text
@auth <token_var>
```

- Request-step only
- Selects token variable to inject/expect (`client_token` or `ops_token` in v1)
- Supported token vars:
  - `client_token` – client credentials (machine-to-machine)
  - `ops_token` – implicit flow (browser-based)
- Runtime behavior:
  - If token already set in `.env`, use it
  - Else recorder fetches it before running (client credentials or implicit flow)
  - If request already has `Authorization` header, use authored header as-is
  - Else inject `Authorization: Bearer {{<token_var>}}`

### 6.3 `@set`

```text
@set <var_name>=<expression>
```

- Request-step only
- May appear multiple times
- Evaluated after response is received
- Expression supports:
  - `{{response.body.path}}`
  - `{{response.headers.Header-Name}}`
  - `{{vars.otherVar}}`

Examples:

```text
@set customer_id={{response.body.id}}
@set status_code={{response.status}}
```

### 6.4 `@wait`

```text
@wait <seconds>
```

- Wait-step only
- `<seconds>`: positive number (integer or decimal)

### 6.5 `@wait_for_continue`

```text
@wait_for_continue <label text>
```

- WaitForContinue-step only
- Label text optional; default is `Continue`

---

## 7. Variable systems

Two variable systems intentionally coexist.

### 7.1 Environment expansion in `.env`

- `.env` file loading uses `${ENV_VAR}` semantics.
- Happens before request rendering.

### 7.2 Request interpolation in `.http`

- `.http` uses `{{var}}` syntax.
- Happens at request render time.

Sources for `{{...}}`:

- `{{base_url}}` and other env-provided variables
- `{{vars.<name>}}` runtime variable store
- direct aliases like `{{client_token}}`, `{{ops_token}}`

---

## 8. Built-in helper tokens

Supported in request URL, headers, and body:

- `{{$uuid}}`
- `{{$random_string}}`
- `{{$random_int}}`

Semantics:

- Replaced at render time per occurrence
- Each occurrence is independent
- Values are captured in variable snapshot metadata when assigned via `@set` or persisted internally

---

## 9. Auth and token expectations

The `.http` format uses two token variables:

- **`client_token`** – client credentials (machine-to-machine). Requires `OAUTH_TOKEN_URL`, `CLIENT_ID`, `CLIENT_SECRET` in `.env`. If already set in `.env`, recorder skips fetching.
- **`ops_token`** – implicit flow (browser-based). Requires `AUTHORIZE_URL`, `BROWSER_CLIENT_ID`, `REDIRECT_URI` in `.env`. If already set in `.env`, recorder skips fetching.

`@auth` chooses which token a request expects. The recorder fetches tokens up front only for auth vars used in the flow, and only if not already present in `.env`.

If `@auth` is omitted, request runs without implicit auth injection unless `Authorization` header is authored explicitly.

---

## 10. Runtime behavior and tape output

The parser does **not** need to build a new intermediate flow model.

Execution path:

1. Parse next segment from `.http`.
2. Resolve interpolation and directives for that segment.
3. Execute request/wait/pause immediately.
4. Append resulting step record to tape output using existing recorder schema.

### Request steps

For request segments, write the same request/response envelope currently emitted by recorder:

- rendered request method/url/headers/body
- response status/headers/body
- timing metadata
- variable snapshot updates from `@set`

### Wait steps

For `@wait`, append a timeline step with wait metadata (`seconds`) so playback preserves pacing.

### Wait-for-continue steps

For `@wait_for_continue`, append a timeline step with pause metadata (`label`) and resume marker after continue is triggered.

This keeps `.http` execution fully compatible with existing player behavior and tape consumers.

---

## 11. Parser algorithm (reference)

1. Read file(s) as UTF-8.
2. Split content into segments on `###` separator lines.
3. For each non-empty segment:
   1. Parse directive lines (`@...`) first.
   2. Determine step type (`request`, `wait`, `waitForContinue`).
   3. Parse step payload using type-specific rules.
   4. Validate directive compatibility with type.
4. Normalize IDs (`@name` or auto-generated).
5. Emit warnings for non-fatal issues.
6. Return an execution-ready parse stream (or fail on fatal parse errors).

---

## 12. Validation and errors

### 12.1 Fatal parser errors

- No request line in a segment that is not wait/pause
- Multiple request lines in a segment
- Malformed header line (missing `:`) in header block
- Invalid `@wait` numeric value
- Unknown directive when `--strict-directives` is enabled

### 12.2 Warnings (single warning type)

- Duplicate `@name`
- Unknown directive (ignored) in default mode
- `Content-Type: application/json` with non-JSON body
- Unresolved interpolation token
- Duplicate headers that may conflict (e.g. two Authorization headers)

---

## 13. User-facing doc excerpt (quick guide)

### Example `.http` flow

```http
@name createCustomer
@auth client_token
@set customer_id={{response.body.id}}
POST {{base_url}}/v1.1/customers
Content-Type: application/json

{
  "externalRef": "{{$random_string}}"
}

###
@wait 5

###
@wait_for_continue Continue once customer appears in UI

###
@name getCustomer
@auth ops_token
GET {{base_url}}/v1.1/customers/{{vars.customer_id}}
```

### Example `.env` (for recorder)

```dotenv
BASE_URL=https://api.example.com

# Client credentials (client_token)
OAUTH_TOKEN_URL=https://auth.example.com/oauth/token
CLIENT_ID=...
CLIENT_SECRET=...

# Implicit flow (ops_token)
AUTHORIZE_URL=https://auth.example.com/authorize
BROWSER_CLIENT_ID=...
REDIRECT_URI=http://localhost:7777/callback
```

If `client_token` or `ops_token` are already set in `.env`, the recorder skips fetching.

### Run

From the repo root (run the recorder directly to avoid npm consuming `--env-file` and `-o`):

```bash
node recorder/dist/index.js requests/create-customer.http --env-file .env.dev -o tape.json
```

Or, if `bondtrace-record` is on your PATH:

```bash
bondtrace-record requests/create-customer.http --env-file .env.dev -o tape.json
```

---

## 14. Compatibility guarantees

- `.http` and JSON flow inputs both emit the same recorder `tape.json` shape.
- Tape output remains compatible with existing player.
- Wait and pause steps are preserved in timeline metadata.
