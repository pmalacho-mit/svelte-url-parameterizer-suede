<script lang="ts" module>
  import { onDestroy, onMount } from "svelte";
  import { URLParameterize } from "../release";

  URLParameterize.decode("");

  let prefix = $state("app_");

  class Internal {
    item = $state({
      hello: "world",
    });

    readonly urlTrack: URLParameterize.Return;

    constructor(index: number) {
      this.urlTrack = URLParameterize<Internal>(
        this,
        {
          item: (query) => {
            if (
              typeof query === "object" &&
              query !== null &&
              "hello" in query
            ) {
              return {
                hello: String((query as any).hello),
              };
            }
            return { hello: "" };
          },
        },
        {
          onDestroy,
          prefix: () => `${index}_`,
        }
      );
    }
  }

  export class Model {
    hello = $state("world");
    hi = $state<string>();
    //items = $state<number[]>([]);
    others = $state<number[]>([]);
    maybe = $state<string[]>();
    nested = $state<{ a: number; b: string }>({ a: 1, b: "two" });

    items = $state<Internal[]>([new Internal(0), new Internal(1)]);

    readonly url = URLParameterize<Model>(
      this,
      {
        //hi: (query) => (typeof query === "string" ? query : undefined),
        hello: {
          resolve: (query) => (typeof query === "string" ? query : "hi"),
          serialize: (value) => value,
          deserialize: (value) => value,

          previousKeys: [{ fullname: "greeting", remove: true }],
        },
        //   items: {
        //     entries: "multiple",
        //     resolve: Number,
        //     debounce: { idleMs: 1000, maxWaitMs: 3000 },
        //   },
        //   others: {
        //     resolve: (query) =>
        //       Array.isArray(query)
        //         ? query.map(Number)
        //         : query
        //           ? [Number(query)]
        //           : [],
        //   },
        //   nested: (query) => {
        //     if (
        //       typeof query === "object" &&
        //       query !== null &&
        //       "a" in query &&
        //       "b" in query
        //     ) {
        //       return {
        //         a: Number((query as any).a),
        //         b: String((query as any).b),
        //       };
        //     }
        //     return { a: 0, b: "" };
        //   },
        // },
      },
      {
        prefix: () => prefix,
      }
    );
  }
</script>

<script lang="ts">
  const model = new Model();

  onDestroy(model.url.cleanup);

  onMount(async () => {
    // Wait a tick to ensure URL is synced
    await new Promise((r) => setTimeout(r, 2000));
    console.log("Initial model:", model);
  });
</script>

<input bind:value={model.hello} placeholder="Hello" />

<!-- <button onclick={() => (prefix = prefix === "app_" ? "myapp_" : "app_")}>
  Toggle Prefix (current: "{prefix}")
</button> -->

{#each model.items as item}
  <input bind:value={item.item.hello} placeholder="Item hello" />
{/each}

<button
  onclick={() => {
    model.items.shift();
    for (let i = 0; i < model.items.length; i++)
      model.items[i].urlTrack.prefix(`${i}_`);
  }}
>
  Remove front
</button>
<!-- 
<button
  onclick={() =>
    model.hi === undefined ? (model.hi = "hello") : (model.hi = undefined)}
>
  Toggle hi ({model.hi === undefined ? "undefined" : model.hi})
</button>

<div>
  <h1>Items</h1>
  <button onclick={() => model.items.push(model.items.length)}>Add</button>

  {#each model.items as item, index}
    <div>
      <input
        type="number"
        bind:value={model.items[index]}
        placeholder="Item {index}"
      />
      <button onclick={() => model.items.splice(index, 1)}>Remove</button>
    </div>
  {/each}
</div>

<div>
  <h1>Others</h1>
  <button onclick={() => model.others?.push(model.others.length)}>Add</button>
  {#if model.others}
    {#each model.others as other, index}
      <div>
        <input
          type="number"
          bind:value={model.others[index]}
          placeholder="Other {index}"
        />
        <button onclick={() => model.others?.splice(index, 1)}>Remove</button>
      </div>
    {/each}
  {/if}
</div>

<div>
  <h1>Nested Object</h1>
  <div>
    <label>a:</label>
    <input type="number" bind:value={model.nested.a} />
  </div>
  <div>
    <label>b:</label>
    <input type="text" bind:value={model.nested.b} />
  </div>
</div> -->
