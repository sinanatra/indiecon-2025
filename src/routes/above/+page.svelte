<script>
  import P5 from "p5-svelte";

  const apiKey = "DDSWUW-YEQB3S-EEJPFN-45Y0";
  const searchRadius = 2;
  const starlinkCategory = 52;
  const fetchIntervalMs = 240000; // N mins
  const displayDurationMs = 3000;

  let container;
  let userLocation = { lat: 53.5511, lon: 9.9937 }; // fallback: Hamburg
  let satList = [];
  let satIndex = 0;
  let currentSatId = null;
  let showUntil = 0;
  let lastFetchTime = 0;
  let lastDisplayTime = 0;
  let finishedLoop = false;

  function getUserLocation() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
        },
        (err) => {
          console.warn("Geolocation error:", err.message);
          resolve(userLocation);
        }
      );
    });
  }

  async function fetchNearbySatellites() {
    const { lat, lon } = userLocation;
    const url = `https://api.n2yo.com/rest/v1/satellite/above/${lat}/${lon}/0/${searchRadius}/${starlinkCategory}/&apiKey=${apiKey}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      console.log(json);
      if (json.above && json.above.length > 0) {
        satList = json.above;
        satIndex = 0;
        finishedLoop = false;
        console.log("Loaded", satList.length, "satellites");
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
