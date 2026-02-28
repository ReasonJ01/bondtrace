# Bondtrace Recorder Guide

## What is Bondtrace?

Bondtrace turns a Postman collection run into a demo-ready playback. The workflow:

1. **Record** – Run your collection through Newman; Bondtrace captures every request and response into a `tape.json` file.
2. **Curate** – Load the tape in the Bondtrace player. Add captions, hide setup steps, and export a `story.json`.
3. **Demo** – Play the story to walk through your API.

This guide covers step 1 (recording). The player handles steps 2 and 3.

---

## Recording workflow

### Prerequisites

- Node.js and npm
- A Postman collection that runs successfully from top to bottom
- An environment (or collection variables) with values for your templated URLs and headers

### Step 1: Prepare your Postman collection

Before recording, your collection needs a few adjustments.

#### Environment variables must be shared

Postman only exports variables that are marked as **shared**. Unshared variables are omitted from the exported JSON, so Newman never receives them. Any request that uses those variables will fail (e.g. unresolved `{{baseUrl}}` in a URL).

**Fix:** In Postman, edit your environment, ensure each variable has a value, and check the **shared** checkbox for any variable your collection uses. Re-export the environment before recording.

#### Add the Bondtrace environment logger

Bondtrace needs to see your environment state before each request so it can show it in the player and use it in captions. Add this to your collection’s **Pre-request Script**:

```javascript
console.log('__BONDTRACE_ENV__' + JSON.stringify(pm.environment.toObject()));
```

If you use collection-level variables, you can merge them into the environment before logging, or use environment variables for values Bondtrace needs to display.

#### Auth (Bearer / OAuth)

"Inherit auth from parent" does not work reliably with Newman. Use a pre-request script instead:

1. Store your token in an environment or collection variable (e.g. `access_token`).
2. Add a collection-level pre-request script:

```javascript
const token = pm.environment.get("access_token");
if (token) {
  pm.request.headers.add({ key: "Authorization", value: "Bearer " + token });
}
```

**Alternative:** Add a request at the start of your collection that calls your auth endpoint and sets the token with `pm.environment.set("access_token", pm.response.json().access_token)`.

#### Order and scripting

- Put requests in the order you want them to run.
- Use Postman scripts to store data from responses (e.g. `pm.environment.set("customerId", pm.response.json().id)`) and reference those variables in later requests.

If the collection runs successfully in Postman, it should work with Bondtrace.

---

### Step 2: Run the recorder

From the repo root (after `npm install` and `npm run build`):

```bash
npm run record -- collection.json -e environment.json -o tape.json
```

| Option | Description |
|--------|-------------|
| `-e`, `--environment` | Path to your exported Postman environment file |
| `-f`, `--folder` | Run only a specific folder (e.g. `-f "Demo Flow"`) |
| `-o`, `--output` | Output file (default: `tape.json`) |
| `-h`, `--help` | Show usage |

The recorder runs Newman and writes `tape.json`. Upload that file to your Bondtrace player to curate and play the demo.

---

