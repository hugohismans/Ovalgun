<script lang="ts">
  import { onMount } from 'svelte';
  import { startDemoScene } from '../render/scene';

  let canvas: HTMLCanvasElement;

  onMount(() => startDemoScene(canvas));
</script>

<canvas bind:this={canvas}></canvas>
<div class="title">OVALGUN <small>squelette — étape 1</small></div>

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    display: block;
  }
  .title {
    position: fixed;
    top: 16px;
    left: 16px;
    font: 900 28px/1 system-ui, sans-serif;
    color: #fff;
    text-shadow: 0 2px 0 #0004;
  }
  small {
    font-size: 14px;
    font-weight: 600;
    opacity: 0.8;
  }
</style>
