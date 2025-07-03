<script>
  import P5 from "p5-svelte";
  import * as d3 from "d3";
  import { onMount } from "svelte";

  const query_radius = 140;

  let observer = {
    lat: 52.52,
    lon: 13.405,
    alt: 0,
    radius: 18,
    satid: 52,
  };

  let container;
  let satellites = [];
  let stars = [];
  let showNames = true;
  let showCircles = true;
  let showStarNames = true;
  let textSize = 1.5;
  let circleSize = 2;

  let starColor = [170, 170, 170];
  let satColor = [0, 0, 0];

  const cities = [];

  const printFormats = {
    A4: [2480, 3508],
    A3: [3508, 4960],
    A2: [4960, 7016],
    A1: [7016, 9933],
    A0: [9933, 14043],
    "2xA0": [14043, 9933 * 2],
    "7x7A4": [2480 * 7, 3508 * 7],
  };

  const a4Tiling = {
    A4: [1, 1],
    A3: [1, 2],
    A2: [2, 2],
    A1: [2, 4],
    A0: [4, 4],
    "2xA0": [4, 8],
    "7x7A4": [7, 7],
  };

  let selectedFormat = "A3";

  const cardinals = [
    { label: "N", az: 0 },
    { label: "E", az: 90 },
    { label: "S", az: 180 },
    { label: "W", az: 270 },
  ];

  let crop = {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    scale: 1,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
  };

  function updateCropRect() {
    if (typeof window === "undefined" || !container) return;
    const [pw, ph] = printFormats[selectedFormat];
    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    const scale = Math.min(0.9, cw / pw, ch / ph);
    crop.w = pw * scale;
    crop.h = ph * scale;
    crop.scale = scale;
    crop.x = (cw - crop.w) / 2;
    crop.y = (ch - crop.h) / 2;
  }

  onMount(() => {
    updateCropRect();
    window.addEventListener("resize", updateCropRect);
  });

  $: if (selectedFormat) updateCropRect();
  $: if (container) updateCropRect();

  let EquatorialToHorizontal = null;
  let MakeObserver = null;
  let astroReady = false;
  let starsReady = false;

  function fallbackRaDecToAltAz(star, observer, date = new Date()) {
    const lonHours = observer.lon / 15;
    const JD = date / 86400000 + 2440587.5;
    const D = JD - 2451545.0;
    let GMST = 18.697374558 + 24.06570982441908 * D;
    GMST = GMST % 24;
    const LST = (GMST + lonHours) % 24;
    const raHours = parseFloat(star.ra);
    const ha = ((LST - raHours) * 15) % 360;
    const haRad = (ha * Math.PI) / 180;
    const decRad = (parseFloat(star.dec) * Math.PI) / 180;
    const latRad = (observer.lat * Math.PI) / 180;
    const sinAlt =
      Math.sin(decRad) * Math.sin(latRad) +
      Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
    const alt = (Math.asin(sinAlt) * 180) / Math.PI;
    const cosAz =
      (Math.sin(decRad) - Math.sin((alt * Math.PI) / 180) * Math.sin(latRad)) /
      (Math.cos((alt * Math.PI) / 180) * Math.cos(latRad));
    let az = (Math.acos(cosAz) * 180) / Math.PI;
    if (Math.sin(haRad) > 0) az = 360 - az;
    return { alt, az };
  }

  function raDecToAltAz(star, observer, date = new Date()) {
    if (astroReady && EquatorialToHorizontal && MakeObserver) {
      const obs = MakeObserver(observer.lat, observer.lon, observer.alt || 0);
      const hor = EquatorialToHorizontal(
        date,
        obs,
        parseFloat(star.ra),
        parseFloat(star.dec),
        "normal"
      );
      return { alt: hor.altitude, az: hor.azimuth };
    } else {
      return fallbackRaDecToAltAz(star, observer, date);
    }
  }

  function geoToAltAz(target, observer) {
    const lat1 = (observer.lat * Math.PI) / 180;
    const lat2 = (target.lat * Math.PI) / 180;
    const dLon = ((target.lon - observer.lon) * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let az = (Math.atan2(y, x) * 180) / Math.PI;
    az = (az + 360) % 360;

    const dSigma = Math.acos(
      Math.sin(lat1) * Math.sin(lat2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon)
    );
    const alt = 90 - (dSigma * 180) / Math.PI;
    return { alt, az };
  }

  function altAzToCanvas(alt, az, width, height, fov = observer.radius) {
    const r = ((90 - alt) / fov) * (Math.min(width, height) / 2);
    const theta = (az - 90) * (Math.PI / 180);
    const x = width / 2 + r * Math.cos(theta);
    const y = height / 2 + r * Math.sin(theta);
    return { x, y };
  }

  async function getUserLocation() {
    return new Promise((resolve) => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            observer.lat = pos.coords.latitude;
            observer.lon = pos.coords.longitude;
            resolve();
          },
          () => resolve()
        );
      } else {
        resolve();
      }
    });
  }

  async function fetchVisibleSatellites() {
    await getUserLocation();
    satellites = [];
    const url = `https://api.n2yo.com/rest/v1/satellite/above/${observer.lat}/${observer.lon}/${observer.alt}/${query_radius}/${observer.satid}/?apiKey=DDSWUW-YEQB3S-EEJPFN-45Y0`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.above) return;
      satellites = data.above.map((s) => ({
        name: s.satname.replace("STARLINK-", "").replace("STARLINK ", ""),
        lat: s.satlat,
        lon: s.satlng,
      }));
    } catch (err) {
      console.error(err);
    }
  }

  onMount(async () => {
    await d3.csv("hyglike_from_athyg_v32.csv").then((raw) => {
      stars = raw.filter(
        (s) => s.mag !== undefined && !isNaN(+s.mag) && +s.mag < 20
      );
      starsReady = true;
    });

    import("astronomy-engine").then((AstronomyEngine) => {
      EquatorialToHorizontal = AstronomyEngine.EquatorialToHorizontal;
      MakeObserver = AstronomyEngine.MakeObserver;
      astroReady = true;
    });
  });

  let usedLabels = [];
  function isOverlapping(x, y, ctx, text, radius = 10) {
    let w = 0,
      h = 0;
    if (ctx.measureText) {
      w = ctx.measureText(text).width;
      h = textSize * 4;
    } else if (ctx.textWidth) {
      w = ctx.textWidth(text);
      h = textSize * 4;
    }
    const labelRect = { x: x - w / 2, y: y - h, w, h: h + radius };
    for (const r of usedLabels) {
      if (
        labelRect.x < r.x + r.w &&
        labelRect.x + labelRect.w > r.x &&
        labelRect.y < r.y + r.h &&
        labelRect.y + labelRect.h > r.y
      )
        return true;
    }
    usedLabels.push(labelRect);
    return false;
  }

  let sketch = (p) => {
    p.setup = () => {
      let dpr = 12; //window.devicePixelRatio || 1;
      let w = container?.offsetWidth || window.innerWidth;
      let h = container?.offsetHeight || window.innerHeight;
      p.createCanvas(
        container?.offsetWidth || window.innerWidth,
        container?.offsetHeight || window.innerHeight
      );
      p.pixelDensity(dpr);
    };

    p.draw = () => {
      const baseWidth = 2480;
      const scale = p.width / baseWidth;

      if (!starsReady) {
        p.background("white");
        p.fill(0);
        p.textAlign(p.CENTER, p.CENTER);
        p.textSize(22 * scale);
        p.text("Loading stars...", p.width / 2, p.height / 2);
        return;
      }
      p.background("white");
      usedLabels = [];
      const date = new Date();

      p.noStroke();
      p.textSize(textSize * scale);
      p.textAlign(p.CENTER, p.CENTER);
      for (const star of stars) {
        const { alt, az } = raDecToAltAz(star, observer, date);
        if (alt > 0) {
          const { x, y } = altAzToCanvas(
            alt,
            az,
            p.width,
            p.height,
            observer.radius
          );
          p.fill(starColor);
          const starSize = Math.max(1 * scale, 3 * scale - star.mag);
          p.ellipse(x, y, starSize, starSize);

          if (
            showStarNames &&
            star.proper &&
            !isOverlapping(x, y, p, star.proper, starSize * 1.2)
          ) {
            p.textSize(textSize);
            p.fill(starColor);
            p.stroke("white");
            p.strokeWeight(2 * scale);
            const label = star.proper || star.hip || star.id;
            p.text(label, x, y - starSize * scale - 1.2);
            p.noStroke();
            p.strokeWeight(1 * scale);

            p.textSize(textSize);
          }
        }
      }

      p.fill(satColor);
      p.textSize(12 * scale);
      for (const city of cities) {
        if (
          Math.abs(city.lat - observer.lat) < 0.1 &&
          Math.abs(city.lon - observer.lon) < 0.1
        )
          continue;
        const { alt, az } = geoToAltAz(city, observer);
        const { x, y } = altAzToCanvas(
          alt,
          az,
          p.width,
          p.height,
          observer.radius
        );
        p.ellipse(x, y, 12 * scale, 12 * scale);
        p.textAlign(p.CENTER, p.TOP);
        p.text(city.name, x, y + 8 * scale);
      }

      p.fill(satColor);
      p.textSize(24 * scale);
      p.textAlign(p.CENTER, p.CENTER);
      for (const c of cardinals) {
        const { x, y } = altAzToCanvas(
          0,
          c.az,
          p.width,
          p.height,
          observer.radius
        );
        p.text(c.label, x, y - 18 * scale);
      }

      if (satellites.length > 0) {
        p.fill(satColor);
        p.textSize(textSize * scale);
        for (const sat of satellites) {
          const { alt, az } = geoToAltAz(sat, observer);
          if (alt > 0) {
            const { x, y } = altAzToCanvas(
              alt,
              az,
              p.width,
              p.height,
              observer.radius
            );
            if (showCircles) p.ellipse(x, y, circleSize, circleSize);
            if (showNames && !isOverlapping(x, y, p, sat.name, circleSize)) {
              // p.fill([...satColor, 90]);
              p.fill(satColor);
              p.stroke("white");
              p.strokeWeight(2 * scale);
              p.text(sat.name, x, y - circleSize * scale - 1.2);
              p.noStroke();
              p.strokeWeight(1 * scale);
              p.fill(satColor);
            }
          }
        }
      }

      p.push();
      p.noFill();
      p.stroke(0, 80);
      p.strokeWeight(0.5);
      p.rect(crop.x, crop.y, crop.w, crop.h);

      const [cols, rows] = a4Tiling[selectedFormat];
      if (cols > 1 || rows > 1) {
        const tileWOnScreen = crop.w / cols;
        const tileHOnScreen = crop.h / rows;

        for (let i = 1; i < cols; i++) {
          let xx = crop.x + i * tileWOnScreen;
          p.line(xx, crop.y, xx, crop.y + crop.h);
        }

        for (let j = 1; j < rows; j++) {
          let yy = crop.y + j * tileHOnScreen;
          p.line(crop.x, yy, crop.x + crop.w, yy);
        }
      }
      p.pop();
    };

    p.mousePressed = () => {
      if (
        p.mouseX > crop.x &&
        p.mouseX < crop.x + crop.w &&
        p.mouseY > crop.y &&
        p.mouseY < crop.y + crop.h
      ) {
        crop.dragging = true;
        crop.dragOffsetX = p.mouseX - crop.x;
        crop.dragOffsetY = p.mouseY - crop.y;
      }
    };

    p.mouseReleased = () => {
      crop.dragging = false;
    };

    p.mouseDragged = () => {
      if (crop.dragging) {
        crop.x = Math.max(
          0,
          Math.min(p.mouseX - crop.dragOffsetX, p.width - crop.w)
        );
        crop.y = Math.max(
          0,
          Math.min(p.mouseY - crop.dragOffsetY, p.height - crop.h)
        );
      }
    };

    p.windowResized = () => {
      let dpr = 12; //window.devicePixelRatio || 1;
      let w = container?.offsetWidth || window.innerWidth;
      let h = container?.offsetHeight || window.innerHeight;
      p.resizeCanvas(w * dpr, h * dpr);
      p.pixelDensity(dpr);
      updateCropRect();
    };
  };

  async function splitAndSaveTiles(format = selectedFormat) {
    const [cols, rows] = a4Tiling[format];
    const canvas = container.querySelector("canvas");
    if (!canvas) return;

    let dpr = 12; //window.devicePixelRatio || 1;

    const sourceW = crop.w * dpr;
    const sourceH = crop.h * dpr;
    const tileSourceW = sourceW / cols;
    const tileSourceH = sourceH / rows;

    function sleep(ms) {
      return new Promise((res) => setTimeout(res, ms));
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = Math.round((crop.x + col * (crop.w / cols)) * dpr);
        const sy = Math.round((crop.y + row * (crop.h / rows)) * dpr);
        const sw = Math.round(tileSourceW);
        const sh = Math.round(tileSourceH);

        const tile = document.createElement("canvas");
        tile.width = sw;
        tile.height = sh;
        const tctx = tile.getContext("2d");
        tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        const url = tile.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${format}_tile_row-${row + 1}_col-${col + 1}.png`;
        a.click();

        await sleep(100);
      }
    }
  }
</script>

<div class="controls">
  <button on:click={fetchVisibleSatellites}>Load Satellites</button>
  <label>
    Export Format:
    <select bind:value={selectedFormat}>
      {#each Object.keys(printFormats) as fmt}
        <option value={fmt}>{fmt}</option>
      {/each}
    </select>
  </label>
  <button on:click={() => splitAndSaveTiles(selectedFormat)}>
    Export {selectedFormat} (A4 tiles)
  </button>

  <label>
    FOV:
    <input type="range" min="10" max="180" bind:value={observer.radius} />
    {observer.radius}°
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

<div class="viz-container" bind:this={container}>
  <P5 {sketch} />
</div>

<style>
  :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }

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
  .viz-container {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
  }
  :global(canvas) {
    display: block;
  }
</style>
