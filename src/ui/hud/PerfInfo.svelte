<!--
  Compteur d'images par seconde (réglage « Afficher les images/s »), en haut à droite au-dessus du flux d'événements ;
  en ligne : ping. Qualité graphique en cours (Auto peut l'avoir baissée).
-->
<script lang="ts">
  import { hud } from '../state/hud.svelte';

  const s = $derived(hud.snap);
  const QUALITY_LABELS = { haut: 'Haut', moyen: 'Moyen', bas: 'Bas' } as const;
</script>

{#if s}
  <div class="perf">
    <b class:low={s.fps < 45}>{s.fps.toFixed(0)}</b> img/s{#if s.ping >= 0}<span> · {s.ping} ms</span>{/if}<span class="dim"> · {QUALITY_LABELS[s.quality]}</span>
  </div>
{/if}

<style>
  .perf {
    padding: 0.25rem 0.55rem;
    border-radius: 0.5rem;
    background: rgb(10 8 32 / 0.6);
    color: #fff;
    font: 700 0.75rem/1.2 var(--font);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  b {
    color: #7dffb5;
  }
  b.low {
    color: #ff7a7a;
  }
  .dim {
    opacity: 0.6;
  }
</style>
