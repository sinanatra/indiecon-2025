<script>
  import * as satellite from "satellite.js";
  import { tles } from "$lib/tles.js";
  import P5 from "p5-svelte";

  const apiKey = "DDSWUW-YEQB3S-EEJPFN-45Y0";

  const observer = {
    lat: 51.1657,
    lon: 10.4515,
    alt: 0,
    radius: 20,
    satid: 52,
  };

  const satelliteLimit = 30;
  const pathDurationSeconds = 3 * 60;
  const pathStepSeconds = 60;

  let container;
  let satellites = [];
  let mapImage;
  let useCachedData = false;

  async function getUserLocation() {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          observer.lat = pos.coords.latitude;
          observer.lon = pos.coords.longitude;
          resolve();
        },
        (err) => {
          console.warn("Geolocation error:", err.message);
          resolve();
        }
      );
    });
  }

  function fetchStarlinkListOnce() {
    satellites = [];

    if (useCachedData) {
      tles.slice(0, satelliteLimit).forEach(({ id, name, tle }) => {
        computePathFromTLE(id, name, tle);
      });
    } else {
      const url = `https://api.n2yo.com/rest/v1/satellite/above/${observer.lat}/${observer.lon}/${observer.alt}/${observer.radius}/${observer.satid}/&apiKey=${apiKey}`;
      fetch(url)
        .then((res) => res.json())
        .then((data) => {
          console.log(data);
          if (!data.above) return;
          const selected = data.above.slice(0, satelliteLimit);
          selected.forEach((sat) => {
            fetchTLEThenComputePath(sat.satid, sat.satname);
          });
        })
        .catch((err) => console.error("Error fetching list:", err));
    }
  }

  function fetchTLEThenComputePath(satId, satName) {
    const url = `https://api.n2yo.com/rest/v1/satellite/tle/${satId}&apiKey=${apiKey}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        console.log(data);

        if (!data.tle) return;
        const tleLines = data.tle.trim().split("\n");
        if (tleLines.length < 2) return;
        computePathFromTLE(satId, satName, tleLines);
      })
      .catch((err) => console.error(`Error fetching TLE for ${satId}:`, err));
  }

  function computePathFromTLE(satId, satName, tle) {
    const satrec = satellite.twoline2satrec(tle[0], tle[1]);
    const now = new Date();
    const path = [];

    for (let i = 0; i <= pathDurationSeconds; i += pathStepSeconds) {
      const time = new Date(now.getTime() + i * 1000);
      const posVel = satellite.propagate(satrec, time);
      if (!posVel.position) continue;

      const gmst = satellite.gstime(time);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = satellite.degreesLong(geo.longitude);
      path.push({ lat, lon });
    }

    satellites.push({ id: satId, name: satName, path });
  }

  function downloadGeoJSON() {
    const features = satellites.map((sat) => ({
      type: "Feature",
      properties: {
        id: sat.id,
        name: sat.name,
      },
      geometry: {
        type: "LineString",
        coordinates: sat.path.map((p) => [p.lon, p.lat]),
      },
    }));

    const geojson = {
      type: "FeatureCollection",
      features,
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/json",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "satellite_paths.geojson";
    link.click();
  }

  let sketch = (p) => {
    let w, h;

    p.preload = () => {
      mapImage = p.loadImage(
        "https://upload.wikimedia.org/wikipedia/commons/8/83/Equirectangular_projection_SW.jpg"
      );
    };

    p.setup = async () => {
      w = container?.offsetWidth || window.innerWidth;
      h = container?.offsetHeight || window.innerHeight;
      p.createCanvas(w, h);
      await getUserLocation();
      fetchStarlinkListOnce();
    };

    p.draw = () => {
      p.image(mapImage, 0, 0, p.width, p.height);

      for (let sat of satellites) {
        drawPath(p, sat.path);
        drawSatellite(p, sat.path[0], sat.name);
      }

      const x = p.map(observer.lon, -180, 180, 0, p.width);
      const y = p.map(observer.lat, 90, -90, 0, p.height);
      p.fill(0, 255, 0);
      p.noStroke();
      p.ellipse(x, y, 10, 10);

      const earthCircumferenceKm = 40075;
      const radiusPx = (observer.radius / earthCircumferenceKm) * p.width * 2;
      p.noFill();
      p.stroke(0, 255, 0, 150);
      p.ellipse(x, y, radiusPx, radiusPx);
    };

    p.windowResized = () => {
      const newW = container?.offsetWidth || window.innerWidth;
      const newH = container?.offsetHeight || window.innerHeight;
      p.resizeCanvas(newW, newH);
    };
  };

  function drawPath(p, path) {
    p.noFill();
    p.stroke(0, 0, 255);
    p.strokeWeight(1);
    p.beginShape();
    for (let pos of path) {
      let x = p.map(pos.lon, -180, 180, 0, p.width);
      let y = p.map(pos.lat, 90, -90, 0, p.height);
      p.vertex(x, y);
    }
    p.endShape();
  }

  function drawSatellite(p, currentPos, name) {
    let x = p.map(currentPos.lon, -180, 180, 0, p.width);
    let y = p.map(currentPos.lat, 90, -90, 0, p.height);
    p.fill(0);
    p.noStroke();
    p.ellipse(x, y, 6, 6);
    p.fill(0);
    p.textSize(10);
    p.text(name, x + 5, y - 5);
  }

  $: if (container) fetchStarlinkListOnce();
</script>

<div class="controls">
  <label>
    <input type="checkbox" bind:checked={useCachedData} />
    Use Cached TLE Data
  </label>
  <button on:click={downloadGeoJSON}>Download GeoJSON</button>
</div>

<div class="viz-container" bind:this={container}>
  <P5 {sketch} />
</div>

<style>
  .controls {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    padding: 0.5rem;
    border-radius: 0.5rem;
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .viz-container {
    width: 100vw;
    height: 100vh;
    position: relative;
  }

  :global(canvas) {
    display: block;
  }
</style>
