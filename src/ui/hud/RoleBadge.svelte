<!--
  Indicateur de rôle (étape 8), en bas à gauche : signe géométrique du rôle (le même que sur le joueur en 3D) dans la
  couleur de l'équipe, nom du rôle, équipe ; badge « PORTEUR » quand le joueur local a le ballon.
-->
<script lang="ts">
  import Icon from '../common/Icon.svelte';
  import { hud } from '../state/hud.svelte';

  const s = $derived(hud.snap);
</script>

{#if s}
  <div class="role" style:--tc={s.team === 0 ? 'var(--t0)' : 'var(--t1)'}>
    <span class="sign"><Icon name={s.role} size="1.7rem" label={s.roleLabel} /></span>
    <span class="txt">
      <b>{s.roleLabel}</b>
      <small>{s.match.teamNames[s.team]}</small>
    </span>
    {#if s.carrier}
      <span class="carrier"><Icon name="ball" size="1.05rem" /> PORTEUR</span>
    {/if}
  </div>
{/if}

<style>
  .role {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.9rem 0.35rem 0.4rem;
    border-radius: 2rem;
    background: var(--panel);
    box-shadow:
      inset 0 0 0 0.12rem rgb(255 255 255 / 0.1),
      0 0.22rem 0 rgb(0 0 0 / 0.3);
    color: #fff;
  }
  .sign {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 50%;
    background: var(--tc);
    color: #fff;
    --icon-cut: var(--tc);
    box-shadow: inset 0 -0.2rem 0 rgb(0 0 0 / 0.2);
  }
  .txt {
    display: flex;
    flex-direction: column;
    line-height: 1.05;
  }
  .txt b {
    font: italic 900 1.1rem/1.05 var(--font);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .txt small {
    font: 800 0.7rem/1.2 var(--font);
    color: var(--tc);
    filter: brightness(1.25);
  }
  .carrier {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: 0.3rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: var(--accent);
    color: var(--ink);
    --icon-cut: var(--accent);
    font: italic 900 0.75rem/1 var(--font);
    letter-spacing: 0.08em;
  }
  @media (prefers-reduced-motion: no-preference) {
    .carrier {
      animation: carrier-in 0.35s cubic-bezier(0.2, 1.6, 0.4, 1);
    }
  }
  @keyframes carrier-in {
    from {
      transform: scale(0.4);
      opacity: 0;
    }
  }
</style>
