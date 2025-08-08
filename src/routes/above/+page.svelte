<script>
  import P5 from "p5-svelte";

  const searchRadius = 30;
  const starlinkCategory = 52;
  const fetchIntervalMs = 120000;
  const displayDurationMs = 3000;

  let container;
  let userLocation = { lat: 53.5511, lon: 9.9937 };
  let satList = [];
  let satIndex = 0;
  let currentSatId = null;
  let showUntil = 0;
  let lastFetchTime = 0;
  let lastDisplayTime = 0;
  let finishedLoop = false;

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
        console.log("Loaded", satList.length, "satellites");
      } else {
        satList = [];
        finishedLoop = true;
      }
    } catch (err) {
      console.error("Error fetching satellites:", err);
    }
  }

  let sketch = (p) => {
    p.setup = async () => {
      p.createCanvas(window.innerWidth, window.innerHeight);
      userLocation = await getUserLocation();
      await fetchNearbySatellites();
      lastFetchTime = performance.now();
      lastDisplayTime = performance.now();
    };

    p.draw = () => {
      const now = performance.now();

      // after finishing a full pass, schedule a refresh
      if (now - lastFetchTime > fetchIntervalMs && finishedLoop) {
        fetchNearbySatellites();
        lastFetchTime = now;
      }

      if (
        !finishedLoop &&
        now - lastDisplayTime > displayDurationMs &&
        satList.length > 0 &&
        satIndex < satList.length
      ) {
        currentSatId = satList[satIndex].satname;
        showUntil = now + displayDurationMs;
        satIndex++;
        lastDisplayTime = now;

        if (satIndex >= satList.length) {
          finishedLoop = true;
        }
      }

      p.background(currentSatId && now < showUntil ? [255, 0, 0] : 0);
      p.fill(currentSatId && now < showUntil ? 0 : 255);

      p.textSize(24);
      p.textAlign(p.LEFT, p.TOP);
      p.text(
        `Satellites found: ${satList.length}\nLocation: ${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`,
        20,
        20
      );

      if (currentSatId && now < showUntil) {
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(150);
        p.text(`${currentSatId}`, p.width / 2, p.height / 2);
      }
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
    };
  };
</script>

<div class="viz-container" bind:this={container}>
  <P5 {sketch} />
</div>

<style>
  .viz-container {
    width: 100vw;
    height: 100vh;
    position: relative;
  }
  :global(canvas) {
    display: block;
  }
</style>
