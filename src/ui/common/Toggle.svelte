<!--
  Interrupteur accessible (role="switch") : réglages (inversion Y, aide à la visée, vibrations), mode entraînement.
  Clic, Entrée / Espace, A à la manette.
-->
<script lang="ts">
  let { label, hint = '', checked, onchange }: { label: string; hint?: string; checked: boolean; onchange: (v: boolean) => void } = $props();
</script>

<button type="button" class="toggle" role="switch" aria-checked={checked} class:on={checked} onclick={() => onchange(!checked)}>
  <span class="txt">
    <b>{label}</b>
    {#if hint}<small>{hint}</small>{/if}
  </span>
  <span class="track" aria-hidden="true"><i></i></span>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
    padding: 0.55rem 0.8rem;
    border: 0;
    border-radius: var(--r-md);
    background: rgb(10 8 32 / 0.55);
    box-shadow: inset 0 0 0 0.1rem var(--stroke);
    color: #fff;
    text-align: left;
    cursor: pointer;
  }
  .toggle:hover {
    background: rgb(255 255 255 / 0.08);
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  b {
    font: 800 0.9rem/1.2 var(--font);
  }
  small {
    font: 600 0.72rem/1.25 var(--font);
    color: var(--text-dim);
  }
  .track {
    position: relative;
    flex: none;
    width: 2.8rem;
    height: 1.5rem;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.18);
    transition: background 0.15s;
  }
  .track i {
    position: absolute;
    left: 0.2rem;
    top: 0.2rem;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0.1rem 0.2rem rgb(0 0 0 / 0.4);
    transition: transform 0.15s;
  }
  .on .track {
    background: var(--good);
  }
  .on .track i {
    transform: translateX(1.3rem);
  }
</style>
