<script>
  export let selectedFormat;
  export let printFormats;
  export let observer;
  export let fov;

  export let textSize;
  export let circleSize;
  export let showNames;
  export let showCircles;
  export let showStarNames;
  export let onExport;
  export let onLoadSatellites;

  function handleExport() {
    onExport && onExport();
  }

  function handleLoadSatellites() {
    onLoadSatellites && onLoadSatellites();
  }
</script>

<div class="controls">
  <button on:click={handleLoadSatellites}>Load Satellites</button>
  <label>
    Export Format:
    <select bind:value={selectedFormat}>
      {#each Object.keys(printFormats) as fmt}
        <option value={fmt}>{fmt}</option>
      {/each}
    </select>
  </label>
  <button on:click={handleExport}>
    Export {selectedFormat} (A4 tiles)
  </button>

  <label>
    FOV:
    <input type="range" min="10" max="180" bind:value={fov} />
    {fov}°
  </label>
  <label>
    Text Size:
    <input type="range" min="0.1" max="24" step="0.1" bind:value={textSize} />
    {textSize}px
  </label>
  <label>
    Circle Size:
    <input type="range" min="0.1" max="20" step="0.1" bind:value={circleSize} />
    {circleSize}px
  </label>
  <label>
    <input type="checkbox" bind:checked={showNames} /> Show Satellite Names
  </label>
  <label>
    <input type="checkbox" bind:checked={showCircles} /> Show Satellite Circles
  </label>
  <label>
    <input type="checkbox" bind:checked={showStarNames} /> Show Star Names
  </label>
</div>

<style>
  .controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
    background: rgba(251, 255, 229, 0.9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    padding: 0.5rem;
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 170px;
    font-size: 13px;
  }
  .controls label {
    font-size: 0.85rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  button {
    padding: 0.35rem 0.65rem;
    border: none;
    border-radius: 0.4rem;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  button:hover {
    background: rgba(220, 220, 220, 0.8);
  }
</style>
