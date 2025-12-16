# Svelte-url-parameterizer-suede

This repo is a [suede dependency](https://github.com/pmalacho-mit/suede). 

To see the installable source code, please checkout the [release branch](https://github.com/pmalacho-mit/svelte-url-parameterizer-suede/tree/release).

## Installation

```bash
bash <(curl https://suede.sh/install-release) --repo pmalacho-mit/svelte-url-parameterizer-suede
```

<details>
<summary>
See alternative to using <a href="https://github.com/pmalacho-mit/suede#suedesh">suede.sh</a> script proxy
</summary>

```bash
bash <(curl https://raw.githubusercontent.com/pmalacho-mit/suede/refs/heads/main/scripts/install-release.sh) --repo pmalacho-mit/svelte-url-parameterizer-suede
```

</details>

```svelte
<script lang="ts">
	function setQueryParam(key, value, { replace = false } = {}) {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);

  if (replace) {
    history.replaceState({}, "", url);
  } else {
    history.pushState({}, "", url);
  }

  // fire a custom event so listeners know about it
  window.dispatchEvent(new Event("urlchange"));
}

(function setupUrlChangeListener() {
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  function emit() {
    window.dispatchEvent(new Event("urlchange"));
  }

  history.pushState = function (...args) {
    origPushState.apply(this, args);
    emit();
  };

  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    emit();
  };

  window.addEventListener("popstate", emit);
})();
	
	type URLParameterHandler<T> = (query: unkown) => T;
	type URLParameterHandlers<T> = {[k in keyof T]: URLParameterHandler<T>}
	
	const URLParameterize = <T,>(target: T, handlers: Partial<URLParameterHandlers<T>>) => {
		for (const key in handlers) {
			$effect(() => {
				const value = target[key];
				if (value !== undefined) {
					console.log(value);
				}
			});
		}
	}
	
	class Example {
		hi = $state(4);

		constructor() {
			URLParameterize(this, {
				hi: { key: "x", parse: (query) => {}, serialize: (y) => {}, encode: ...., decode: ....}
			})
		}
	}

	const example = new Example();
</script>

<button onclick={() => hi.hi += 1}>
	clicks: {example.hi}
</button>

```

```ts
function setObjectInQuery(key: string, value: unknown, { replace = false } = {}) {
  const url = new URL(window.location.href);

  const serialized = encodeURIComponent(JSON.stringify(value));
  url.searchParams.set(key, serialized);

  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", url.toString());
}

function getObjectFromQuery<T>(
  key: string,
  validate?: (value: unknown) => value is T
): T | null {
  const url = new URL(window.location.href);
  const raw = url.searchParams.get(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw));

    if (validate && !validate(parsed)) {
      return null;
    }

    return parsed as T;
  } catch {
    return null;
  }
}
```
