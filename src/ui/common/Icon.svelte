<!--
  Icônes géométriques du HUD et des menus (étape 8), en SVG (currentColor), sans asset externe. Les signes de rôle
  reprennent ceux du rendu 3D : crête plate = pilier (bloc), aileron = ailier (triangle), auréole = demi (anneau).
-->
<script lang="ts" module>
  export type IconName =
    | 'pilier'
    | 'ailier'
    | 'demi'
    | 'dodge'
    | 'slide'
    | 'dive'
    | 'pass'
    | 'kick'
    | 'shield'
    | 'boost'
    | 'zone'
    | 'ammo'
    | 'reload'
    | 'ball'
    | 'tackle'
    | 'intercept'
    | 'try'
    | 'scrum'
    | 'nofire'
    | 'keyboard'
    | 'gamepad'
    | 'settings'
    | 'controls'
    | 'play'
    | 'back'
    | 'restart'
    | 'exit'
    | 'timer'
    | 'bot';
</script>

<script lang="ts">
  let { name, size = '1em', label = '' }: { name: IconName; size?: string; label?: string } = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
>
  {#if name === 'pilier'}
    <path class="f" d="M4 9.5 7 5h10l3 4.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path class="k" d="M4 9.5h16" />
  {:else if name === 'ailier'}
    <path class="f" d="M12 3.2 21 20H3z" />
    <path class="k" d="M12 9.5v6" />
  {:else if name === 'demi'}
    <circle class="s" cx="12" cy="12" r="7.2" />
    <circle class="f" cx="12" cy="12" r="2.6" />
  {:else if name === 'dodge'}
    <path class="s" d="M4 6l6 6-6 6M12 6l6 6-6 6" />
  {:else if name === 'slide'}
    <path class="s" d="M3 17h13l4-4M3 13h6M3 9h3" />
    <circle class="f" cx="15" cy="8" r="2.3" />
  {:else if name === 'dive'}
    <path class="s" d="M4 6l11 9M15 15h-6M15 15V9" />
    <path class="s" d="M3 20h18" />
  {:else if name === 'pass'}
    <path class="s" d="M19 7c-4-3-11-2-13 5M6 12l-2-4M6 12l4.2-1.5" />
    <ellipse class="f" cx="17" cy="16" rx="3.6" ry="2.4" transform="rotate(-30 17 16)" />
  {:else if name === 'kick'}
    <path class="s" d="M4 19c3-9 9-13 16-14M20 5l-5 .5M20 5l-1.5 4.6" />
    <ellipse class="f" cx="7" cy="15" rx="3" ry="2" transform="rotate(-50 7 15)" />
  {:else if name === 'shield'}
    <path class="f" d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z" />
  {:else if name === 'boost'}
    <path class="f" d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6z" />
  {:else if name === 'zone'}
    <circle class="s dash" cx="12" cy="12" r="8" />
    <circle class="f" cx="12" cy="12" r="3.4" />
  {:else if name === 'ammo'}
    <path class="f" d="M5 9a2 2 0 0 1 4 0v11H5zM10 7a2 2 0 0 1 4 0v13h-4zM15 9a2 2 0 0 1 4 0v11h-4z" />
  {:else if name === 'reload'}
    <path class="s" d="M19 12a7 7 0 1 1-2.1-5M17.5 3.5v4h-4" />
  {:else if name === 'ball'}
    <ellipse class="f" cx="12" cy="12" rx="9" ry="5.8" transform="rotate(-30 12 12)" />
    <path class="k" d="M8.5 14.5l7-5M10.4 10.9l1.2 1.7M12.6 9.4l1.2 1.7" />
  {:else if name === 'tackle'}
    <path class="f" d="M12 2l2.2 6.3L21 7l-4.6 5 4.6 5-6.8-1.3L12 22l-2.2-6.3L3 17l4.6-5L3 7l6.8 1.3z" />
  {:else if name === 'intercept'}
    <path class="s" d="M4 12h9M10 8l4 4-4 4" />
    <path class="s" d="M18 5v14" />
  {:else if name === 'try'}
    <path class="s" d="M7 3v18M17 3v18M7 12h10" />
  {:else if name === 'scrum'}
    <circle class="s" cx="12" cy="12" r="8.5" />
    <path class="s" d="M3.5 12h5M20.5 12h-5M6.6 9.4 8.5 12l-1.9 2.6M17.4 9.4 15.5 12l1.9 2.6" />
  {:else if name === 'nofire'}
    <path class="f" d="M10 6a2 2 0 0 1 4 0v14h-4z" />
    <path class="s" d="M4 4l16 16" />
  {:else if name === 'keyboard'}
    <rect class="s" x="2.5" y="6" width="19" height="12" rx="2" />
    <path class="s" d="M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10" />
  {:else if name === 'gamepad'}
    <path class="s" d="M7 7h10a5 5 0 0 1 4.8 6.4l-1 3.4a2.4 2.4 0 0 1-4.1.9L15 16H9l-1.7 1.7a2.4 2.4 0 0 1-4.1-.9l-1-3.4A5 5 0 0 1 7 7z" />
    <path class="s" d="M7 10v4M5 12h4" />
    <circle class="f" cx="16" cy="11" r="1.2" />
    <circle class="f" cx="18" cy="13.2" r="1.2" />
  {:else if name === 'settings'}
    <circle class="s" cx="12" cy="12" r="3.2" />
    <path class="s" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  {:else if name === 'controls'}
    <rect class="s" x="3" y="5" width="18" height="14" rx="3" />
    <path class="s" d="M7 10h4M7 14h6M15 10h2M15 14h2" />
  {:else if name === 'play'}
    <path class="f" d="M7 4.5v15l13-7.5z" />
  {:else if name === 'back'}
    <path class="s" d="M11 5l-7 7 7 7M4 12h16" />
  {:else if name === 'restart'}
    <path class="s" d="M5 12a7 7 0 1 0 2.1-5M6.5 3.5v4h4" />
  {:else if name === 'exit'}
    <path class="s" d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" />
  {:else if name === 'timer'}
    <circle class="s" cx="12" cy="13" r="7.5" />
    <path class="s" d="M12 13V9M9.5 2.5h5" />
  {:else if name === 'bot'}
    <rect class="s" x="5" y="8" width="14" height="11" rx="3" />
    <path class="s" d="M12 8V4.5" />
    <circle class="f" cx="9.3" cy="13.3" r="1.4" />
    <circle class="f" cx="14.7" cy="13.3" r="1.4" />
  {/if}
</svg>

<style>
  .icon {
    display: inline-block;
    flex: none;
    vertical-align: -0.14em;
    overflow: visible;
  }
  .f {
    fill: currentColor;
  }
  .s {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .k {
    fill: none;
    stroke: var(--icon-cut, #0f0d2b);
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .dash {
    stroke-dasharray: 3.2 2.6;
  }
</style>
