<!--
  Choix exclusif en pastilles (étape 8) : 3v3 / 5v5, difficulté… Groupe radio accessible (role="radiogroup") ; chaque
  option est un vrai bouton (Tab, Entrée, clic, A à la manette ; flèches / croix : navigation spatiale du focus).
-->
<script lang="ts" generics="T extends string | number">
  type Option = { value: T; label: string; hint?: string };

  /** `autofocus` : l'option choisie reçoit le focus initial de la portée de navigation (`data-autofocus`). */
  let {
    label,
    options,
    value,
    onselect,
    autofocus = false,
  }: { label: string; options: readonly Option[]; value: T; onselect: (v: T) => void; autofocus?: boolean } = $props();
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={o.value === value} class:on={o.value === value} data-autofocus={autofocus && o.value === value ? '' : undefined} onclick={() => onselect(o.value)}>
      <b>{o.label}</b>
      {#if o.hint}<small>{o.hint}</small>{/if}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    gap: 0.3rem;
    padding: 0.3rem;
    border-radius: var(--r-md);
    background: rgb(10 8 32 / 0.6);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
  }
  button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 5.2rem;
    padding: 0.45rem 0.9rem;
    border: 0;
    border-radius: calc(var(--r-md) - 0.25rem);
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s,
      transform 0.1s;
  }
  button:hover {
    background: rgb(255 255 255 / 0.08);
    color: #fff;
  }
  button.on {
    background: #fff;
    color: var(--ink);
    box-shadow: 0 0.2rem 0 rgb(0 0 0 / 0.3);
  }
  b {
    font: italic 900 1rem/1.1 var(--font);
    letter-spacing: 0.02em;
  }
  small {
    font: 700 0.65rem/1.2 var(--font);
    opacity: 0.8;
  }
</style>
