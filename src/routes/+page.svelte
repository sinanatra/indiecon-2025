<script>
  import * as d3 from "d3";
  import { onMount } from "svelte";
  import About from "$lib/components/About.svelte";
  import Controls from "$lib/components/Controls.svelte";

  let observer = { lat: 52.52, lon: 13.405, alt: 0, radius: 18, satid: 52 };
  let satellites = [];
  let stars = [];
  let showNames = true,
    showCircles = true,
    showStarNames = true;
  let textSize = 0.2,
    circleSize = 0.1;
  let starColor = [170, 170, 170],
    satColor = [0, 0, 0];
  let fov = observer.radius;
  let labelPad = 10;

  let container, canvas;
  const cities = [];
  const printFormats = {
    A4: [2480, 3508],
    A3: [3508, 4960],
    A2: [4960, 7016],
    A1: [7016, 9933],
    A0: [9933, 14043],
    "2xA0": [14043, 9933 * 2],
    "7x7A4": [2480 * 7, 3508 * 7],
    bookmark: [2480, 3508],
  };
  const a4Tiling = {
    A4: [1, 1],
    A3: [1, 2],
    A2: [2, 2],
    A1: [2, 4],
    A0: [4, 4],
    "2xA0": [4, 8],
    bookmark: [1, 3],
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
  let EquatorialToHorizontal = null;
  let MakeObserver = null;
  let astroReady = false;
  let starsReady = false;

  const svgStarPathData =
    "M28.87 14.68h-9.68a3.83 3.83 0 0 0-3.31-3.31V1.69h-1v9.68a3.83 3.83 0 0 0-3.31 3.31h-9.7v1h9.68a3.83 3.83 0 0 0 3.31 3.31v9.68h1v-9.68a3.83 3.83 0 0 0 3.31-3.31h9.68v-1Z";
  const svgStarViewBox = { minX: 0, minY: 0, width: 30, height: 30 };
  let svgStarPath = null;

  function getYShift(h) {
    return -h * 0.45;
  }

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

  function altAzToCanvas(alt, az, width, height, fov, yShift = 0) {
    const r = ((90 - alt) / fov) * (Math.min(width, height) / 2);
    const theta = (az - 90) * (Math.PI / 180);
    const x = width / 2 + r * Math.cos(theta);
    const y = height / 2 + r * Math.sin(theta) + yShift;
    return { x, y };
  }

  function triggerRedraw() {
    if (!canvas) return;
    drawWebUI();
  }

  $: triggerRedraw(),
    [textSize, circleSize, showNames, showCircles, showStarNames, fov];

  function updateCropRect() {
    if (typeof window === "undefined" || !container) return;
    const [pw, ph] = printFormats[selectedFormat];
    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    const scale = Math.min(0.92, cw / pw, ch / ph);
    crop.w = pw * scale;
    crop.h = ph * scale;
    crop.scale = scale;
    crop.x = (cw - crop.w) / 2;
    crop.y = (ch - crop.h) / 2;
  }
  onMount(() => {
    updateCropRect();
    window.addEventListener("resize", () => {
      updateCropRect();
      triggerRedraw();
    });
    if (typeof window !== "undefined" && typeof Path2D !== "undefined") {
      svgStarPath = new Path2D(svgStarPathData);
    }
  });
  $: if (selectedFormat) {
    updateCropRect();
    triggerRedraw();
  }
  $: if (container) {
    updateCropRect();
    triggerRedraw();
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
    const url = `https://api.n2yo.com/rest/v1/satellite/above/${observer.lat}/${observer.lon}/${observer.alt}/140/${observer.satid}/?apiKey=DDSWUW-YEQB3S-EEJPFN-45Y0`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.above) return;
      satellites = data.above.map((s) => ({
        name: s.satname.replace("STARLINK-", "").replace("STARLINK ", ""),
        lat: s.satlat,
        lon: s.satlng,
      }));
      triggerRedraw();
    } catch (err) {
      console.error(err);
    }
  }
  onMount(async () => {
    await d3.csv("hyglike_from_athyg_v32.csv").then((raw) => {
      stars = raw.filter(
        (s) => s.mag !== undefined && !isNaN(+s.mag) && +s.mag < 5
      );
      starsReady = true;
      triggerRedraw();
    });
    import("astronomy-engine").then((AstronomyEngine) => {
      EquatorialToHorizontal = AstronomyEngine.EquatorialToHorizontal;
      MakeObserver = AstronomyEngine.MakeObserver;
      astroReady = true;
      triggerRedraw();
    });
  });

  function isOverlapping(x, y, ctx, text, radius, usedLabels, fontHeight) {
    let w = ctx.measureText(text).width;
    let h = fontHeight;
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

  function drawSvgStar(ctx, x, y, size, fillColor = "#000", halo = true) {
    if (!svgStarPath) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / svgStarViewBox.width, size / svgStarViewBox.height);
    ctx.translate(-svgStarViewBox.width / 2, -svgStarViewBox.height / 2);
    if (halo) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#fff";
      ctx.stroke(svgStarPath);
    }
    ctx.fillStyle = fillColor;
    ctx.fill(svgStarPath);
    ctx.restore();
  }

  function drawSceneOnContext(
    ctx,
    width,
    height,
    drawGrid = false,
    tileViewport = null
  ) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    let usedLabels = [];
    const date = new Date();

    let cropW = width,
      cropH = height,
      offsetX = 0,
      offsetY = 0;
    if (tileViewport) {
      cropW = tileViewport.cropWidth;
      cropH = tileViewport.cropHeight;
      offsetX = tileViewport.offsetX;
      offsetY = tileViewport.offsetY;
    }

    const yShift = getYShift(cropH);
    const fontHeight = textSize * (cropH / 50);
    const starSvgSize = circleSize * cropH * 0.07;
    ctx.font = `${fontHeight}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    function mapCoord({ x, y }) {
      return { x: x - offsetX, y: y - offsetY };
    }

    if (starsReady && showStarNames) {
      ctx.textAlign = "left";
      for (const star of stars) {
        const { alt, az } = raDecToAltAz(star, observer, date);
        if (alt > 0 && star.proper) {
          const c = altAzToCanvas(alt, az, cropW, cropH, fov, yShift);
          const { x, y } = mapCoord(c);
          const labelDX = starSvgSize * 0.15;
          const labelDY = starSvgSize * 0.3;
          const labelX = x + labelDX;
          const labelY = y - labelDY;
          if (
            !isOverlapping(
              labelX,
              labelY,
              ctx,
              star.proper,
              starSvgSize,
              usedLabels,
              fontHeight
            )
          ) {
            ctx.save();
            ctx.lineWidth = 3.2;
            ctx.strokeStyle = "#fff";
            ctx.strokeText(star.proper, labelX, labelY);
            ctx.fillStyle = `rgb(${starColor.join(",")})`;
            ctx.fillText(star.proper, labelX, labelY);
            ctx.restore();

            drawSvgStar(
              ctx,
              x,
              y,
              starSvgSize,
              `rgb(${starColor.join(",")})`,
              true
            );
          }
        }
      }
    }
    ctx.textAlign = "center";

    if (starsReady) {
      for (const star of stars) {
        const { alt, az } = raDecToAltAz(star, observer, date);
        if (alt > 0 && (!star.proper || !showStarNames)) {
          const c = altAzToCanvas(alt, az, cropW, cropH, fov, yShift);
          const { x, y } = mapCoord(c);
          drawSvgStar(
            ctx,
            x,
            y,
            starSvgSize,
            `rgb(${starColor.join(",")})`,
            true
          );
        }
      }
    }

    if (showNames && satellites.length > 0) {
      for (const sat of satellites) {
        const { alt, az } = geoToAltAz(sat, observer);
        if (alt > 0) {
          const c = altAzToCanvas(alt, az, cropW, cropH, fov, yShift);
          const { x, y } = mapCoord(c);
          const dotRadius = Math.max(1, (circleSize * cropH) / 220 / 2);
          const labelY = y - (dotRadius + labelPad);
          if (
            !isOverlapping(
              x,
              y,
              ctx,
              sat.name,
              dotRadius * 2,
              usedLabels,
              fontHeight
            )
          ) {
            ctx.save();
            ctx.lineWidth = 3.2;
            ctx.strokeStyle = "#fff";
            ctx.strokeText(sat.name, x, labelY);
            ctx.fillStyle = `rgb(${satColor.join(",")})`;
            ctx.fillText(sat.name, x, labelY);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, dotRadius + 3, 0, 2 * Math.PI);
            ctx.fillStyle = "#fff";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, dotRadius, 0, 2 * Math.PI);
            ctx.fillStyle = `rgb(${satColor.join(",")})`;
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }
    for (const city of cities) {
      if (
        Math.abs(city.lat - observer.lat) < 0.1 &&
        Math.abs(city.lon - observer.lon) < 0.1
      )
        continue;
      const { alt, az } = geoToAltAz(city, observer);

      const c = altAzToCanvas(alt, az, cropW, cropH, fov, yShift);
      const { x, y } = mapCoord(c);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(city.name, x, y + 8);
      ctx.fillStyle = `rgb(${satColor.join(",")})`;
      ctx.fillText(city.name, x, y + 8);
      ctx.restore();
    }
    for (const c of cardinals) {
      const cc = altAzToCanvas(0, c.az, cropW, cropH, fov, yShift);
      const { x, y } = mapCoord(cc);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.strokeText(c.label, x, y - 18);
      ctx.fillStyle = `rgb(${satColor.join(",")})`;
      ctx.fillText(c.label, x, y - 18);
      ctx.restore();
    }
    if (satellites.length > 0 && showCircles) {
      for (const sat of satellites) {
        const { alt, az } = geoToAltAz(sat, observer);
        if (alt > 0) {
          const c = altAzToCanvas(alt, az, cropW, cropH, fov, yShift);
          const { x, y } = mapCoord(c);
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            Math.max(1, ((circleSize * cropH) / 220 + 3) / 2),
            0,
            2 * Math.PI
          );
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(
            x,
            y,
            Math.max(1, (circleSize * cropH) / 220 / 2),
            0,
            2 * Math.PI
          );
          ctx.fillStyle = `rgb(${satColor.join(",")})`;
          ctx.fill();
          ctx.restore();
        }
      }
    }
    if (drawGrid) {
      ctx.save();
      ctx.strokeStyle = "rgba(0,0,0)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(0, 0, width, height);
      const [cols, rows] = a4Tiling[selectedFormat];
      if (cols > 1 || rows > 1) {
        const tileWOnScreen = width / cols;
        const tileHOnScreen = height / rows;
        for (let i = 1; i < cols; i++) {
          let xx = i * tileWOnScreen;
          ctx.beginPath();
          ctx.moveTo(xx, 0);
          ctx.lineTo(xx, height);
          ctx.stroke();
        }
        for (let j = 1; j < rows; j++) {
          let yy = j * tileHOnScreen;
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(width, yy);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawWebUI() {
    if (!canvas) return;
    const visCtx = canvas.getContext("2d");
    visCtx.clearRect(0, 0, canvas.width, canvas.height);

    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = crop.w;
    previewCanvas.height = crop.h;
    drawSceneOnContext(previewCanvas.getContext("2d"), crop.w, crop.h, true);

    visCtx.drawImage(previewCanvas, crop.x, crop.y, crop.w, crop.h);
  }

  function mouseDown(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (
      mx > crop.x &&
      mx < crop.x + crop.w &&
      my > crop.y &&
      my < crop.y + crop.h
    ) {
      crop.dragging = true;
      crop.dragOffsetX = mx - crop.x;
      crop.dragOffsetY = my - crop.y;
    }
  }
  function mouseUp() {
    if (crop.dragging) {
      crop.dragging = false;
      triggerRedraw();
    }
  }
  function mouseMove(e) {
    if (!crop.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    crop.x = Math.max(
      0,
      Math.min(mx - crop.dragOffsetX, canvas.width - crop.w)
    );
    crop.y = Math.max(
      0,
      Math.min(my - crop.dragOffsetY, canvas.height - crop.h)
    );
    triggerRedraw();
  }

  async function splitAndSaveTiles(format = selectedFormat) {
    const [cols, rows] = a4Tiling[format];
    const [pw, ph] = printFormats[format];
    const tileW = Math.floor(pw / cols);
    const tileH = Math.floor(ph / rows);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tile = document.createElement("canvas");
        tile.width = tileW;
        tile.height = tileH;
        const ctx = tile.getContext("2d");

        const tileViewport = {
          offsetX: col * tileW,
          offsetY: row * tileH,
          cropWidth: pw,
          cropHeight: ph,
          tileW,
          tileH,
        };

        drawSceneOnContext(ctx, tileW, tileH, false, tileViewport);

        const url = tile.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = url;
        a.download = `${format}_tile_row-${row + 1}_col-${col + 1}.png`;
        a.click();
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  }
</script>

<Controls
  bind:selectedFormat
  {printFormats}
  {observer}
  bind:textSize
  bind:fov
  bind:circleSize
  bind:showNames
  bind:showCircles
  bind:showStarNames
  onExport={splitAndSaveTiles}
  onLoadSatellites={fetchVisibleSatellites}
/>
<About />
<div class="viz-container" bind:this={container}>
  <canvas
    bind:this={canvas}
    width={container ? container.offsetWidth : 800}
    height={container ? container.offsetHeight : 600}
    on:mousedown={mouseDown}
    on:mouseup={mouseUp}
    on:mouseleave={mouseUp}
    on:mousemove={mouseMove}
  />
</div>

<style>
  :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }
  .viz-container {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
  }
</style>
