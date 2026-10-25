<!--
  Informations de debug (?debug seulement), en bas à gauche au-dessus de l'indicateur de rôle : vitesse, mouvement,
  cooldowns bruts, cible de passe, images par seconde, tick, périphérique, aide à la visée.
-->
<script lang="ts">
  import { hud } from '../state/hud.svelte';

  const s = $derived(hud.snap);
  const MOVE_LABELS: Record<string, string> = {
    run: 'course',
    dodge: 'esquive',
    slide: 'glissade',
    dive: 'plongeon',
    dive_recover: 'au sol',
    climb: 'grimpe',
  };
</script>

{#if s}
  <div class="debug">
    <div><b>{s.speed.toFixed(1)}</b> m/s · {MOVE_LABELS[s.move] ?? s.move}{s.onGround ? '' : ' · en l’air'}{s.sprinting ? ' · sprint' : ''}{s.carrier ? ' · porteur' : ''}</div>
    <div class="dim">
      {s.fps.toFixed(0)} img/s · tick {s.tick} · {s.activeDevice === 'gamepad' ? 'manette' : 'clavier/souris'}{s.assistTarget >= 0 ? ' · aide visée #' + s.assistTarget : ''}
    </div>
  </div>
{/if}

<style>
  .debug {
    padding: 0.35rem 0.6rem;
    border-radius: var(--r-sm);
    background: rgb(15 13 43 / 0.7);
    color: #fff;
    font: 600 0.72rem/1.4 var(--font);
    pointer-events: none;
  }
  .dim {
    color: var(--text-faint);
  }
</style>
