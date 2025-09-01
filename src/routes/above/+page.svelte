<script>
  import { onMount, onDestroy } from "svelte";

  const searchRadius = 30;
  const starlinkCategory = 52;
  const fetchIntervalMs = 120000;
  const displayDurationMs = 300;

  let userLocation = { lat: 53.5511, lon: 9.9937 };
  let satList = [];
  let satIndex = 0;
  let finishedLoop = false;

  let lastFetchTime = 0;
  let listEl;
  let emitTimer, refreshTimer;

  let rows = [];

  function getUserLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(userLocation);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(userLocation)
      );
    });
  }

  async function fetchNearbySatellites() {
    const { lat, lon } = userLocation;
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      alt: "0",
      radius: String(searchRadius),
      category: String(starlinkCategory),
    });

    try {
      const res = await fetch(`/api/satellites?${params.toString()}`);
      if (!res.ok) {
        console.warn("Proxy error:", res.status, await res.text());
        return;
      }
      const json = await res.json();
      if (json?.above?.length) {
        satList = json.above;
        satIndex = 0;
        finishedLoop = false;
      } else {
        satList = [];
        finishedLoop = true;
      }
      lastFetchTime = performance.now();
    } catch (err) {
      console.error("Error fetching satellites:", err);
    }
  }

  function emitNextRow() {
    if (satIndex < satList.length) {
      const sat = satList[satIndex++];
      rows = [...rows, sat];
      queueMicrotask(() => {
        if (listEl) listEl.scrollTop = listEl.scrollHeight;
      });
      if (satIndex >= satList.length) finishedLoop = true;
    }
  }

  async function init() {
    userLocation = await getUserLocation();
    await fetchNearbySatellites();

    emitTimer = setInterval(emitNextRow, displayDurationMs);
    refreshTimer = setInterval(async () => {
      const now = performance.now();
      if (finishedLoop && now - lastFetchTime > fetchIntervalMs) {
        await fetchNearbySatellites();
      }
    }, 3000);
  }

  onMount(init);
  onDestroy(() => {
    clearInterval(emitTimer);
    clearInterval(refreshTimer);
  });
</script>

<div class="viz">
  <header class="stats">
    <div>Satellites found: <strong>{satList.length}</strong></div>
    <div>
      Location: {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
    </div>
  </header>

  <ul class="glossary" bind:this={listEl} aria-label="Stacking satellites">
    {#each rows as sat}
      <li>
        <div class="row-main">
          <span class="term" title={sat.satname}>{sat.satname}</span>
          <!-- <span class="num">{sat.satid}</span> -->
        </div>

        <div class="row-meta">
          <span>Designator: {sat.intDesignator}</span>
          <span>Launch: {sat.launchDate}</span>
        </div>

        <div class="row-meta">
          <span>Alt: {sat.satalt.toFixed(1)} km</span>
          <span>Lat: {sat.satlat.toFixed(2)}°</span>
          <span>Lon: {sat.satlng.toFixed(2)}°</span>
        </div>
      </li>
    {/each}
  </ul>
</div>

<style>
  .viz {
    width: 100vw;
    height: 100vh;
    padding: 5px;
    box-sizing: border-box;
    background: #000;
    color: #fff;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 16px;
    font-size: 2vw;
  }

  .stats {
    font-size: 1.5em;
    display: flex;
    gap: 24px;
    align-items: baseline;
    font-family: Arial, Helvetica, sans-serif;
    opacity: 0.9;
  }

  .glossary {
    margin: 0;
    padding: 8px;
    list-style: none;
    overflow-y: auto;
    background: rgba(20, 20, 24, 0.35);
    backdrop-filter: blur(6px);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    font-size: 2em;
  }

  .glossary li {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    gap: 2px;
    padding: 10px;
  }
  .glossary li:last-child {
    border-bottom: none;
  }

  .row-main {
    display: grid;
    grid-template-columns: 1fr max-content;
    gap: 16px;
    padding-bottom: 10px;
    align-items: baseline;
  }

  .term {
    font-size: 1.2em;
    color: yellow;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .num {
    font-size: 1em;

    opacity: 0.9;
    padding: 2px 10px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    white-space: nowrap;
  }

  .row-meta {
    display: flex;
    gap: 16px;
    font-size: 0.9em;

    opacity: 0.8;
    flex-wrap: wrap;
  }
</style>
