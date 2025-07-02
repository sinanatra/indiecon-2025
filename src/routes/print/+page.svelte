<script>
  import P5 from "p5-svelte";

  let geojson = null;
  let paths = [];
  let gcode = "";

  const canvasWidth = 148;
  const canvasHeight = 210;
  const margin = 10;
  let container;

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      geojson = JSON.parse(e.target.result);

      let minLon = Infinity,
        maxLon = -Infinity;
      let minLat = Infinity,
        maxLat = -Infinity;
      geojson.features.forEach((f) => {
        f.geometry.coordinates.forEach(([lon, lat]) => {
          minLon = Math.min(minLon, lon);
          maxLon = Math.max(maxLon, lon);
          minLat = Math.min(minLat, lat);
          maxLat = Math.max(maxLat, lat);
        });
      });

      const availW = canvasWidth - 2 * margin;
      const availH = canvasHeight - 2 * margin;
      const lonRange = maxLon - minLon;
      const latRange = maxLat - minLat;
      const scaleX = availW / lonRange;
      const scaleY = availH / latRange;

      const seen = new Set();
      paths = [];
      geojson.features.forEach((f) => {
        const id = f.properties?.id || f.properties?.name;
        if (!id || seen.has(id)) return;
        seen.add(id);

        const path = f.geometry.coordinates.map(([lon, lat]) => ({
          x: margin + (lon - minLon) * scaleX,
          y: margin + (maxLat - lat) * scaleY,
        }));
        paths.push({ id, path });
      });
    };
    reader.readAsText(file);
  }

  function generateGCode() {
    const feedTravel = 10000;
    const feedDraw = 3500;
    const pauseMs = 0.2;
    const penUpCmd = "M5";
    const penDownCmd = "M3 S1000";

    let lines = [
      "G21         ; units = mm",
      "G90         ; absolute positioning",
      penUpCmd,
      `G4 P${pauseMs} ; initial pause`,
    ];

    paths.forEach(({ path }) => {
      if (!path || path.length < 2) return;

      const start = path[0];
      lines.push(
        `G4 P${pauseMs} ; pause before travel`,
        `G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${feedTravel}`
      );

      lines.push(`G4 P${pauseMs}`, penDownCmd, `G4 P${pauseMs}`);

      for (let i = 1; i < path.length; i++) {
        const { x, y } = path[i];
        lines.push(`G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedDraw}`);
      }

      lines.push(penUpCmd, `G4 P${pauseMs}`);
    });

    gcode = lines.join("\n");
    const blob = new Blob([gcode], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "satellite_paths.gcode";
    link.click();
  }

  let sketch = (p) => {
    p.setup = () => {
      p.createCanvas(canvasWidth, canvasHeight);
      p.background(255);
      p.stroke(0);
      p.noFill();
    };

    p.draw = () => {
      p.clear();
      p.background(255);

      p.stroke(150);
      p.noFill();
      p.rect(0, 0, canvasWidth, canvasHeight);

      paths.forEach(({ id, path }) => {
        if (!path || path.length === 0) return;

        p.beginShape();
        path.forEach((pt) => p.vertex(pt.x, pt.y));
        p.endShape();

        const first = path[0];
        p.fill(0);
        p.noStroke();
        p.textSize(8);
        p.text(id, first.x + 2, first.y - 2);
        p.noFill();
        p.stroke(0);

        const last = path[path.length - 1];
        p.fill(255, 0, 0);
        p.noStroke();
        p.ellipse(last.x, last.y, 4, 4);
        p.noFill();
        p.stroke(0);
      });
    };
  };
</script>

<div class="controls">
  <input type="file" accept=".geojson,.json" on:change={handleFileUpload} />
  <button on:click={generateGCode}>Export G-code</button>
</div>

<div class="viz-container" bind:this={container}>
  <P5 {sketch} />
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background: #f0f0f0;
  }

  .controls {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    background: rgba(0, 0, 0, 0.6);
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
    display: flex;
    justify-content: center;
    align-items: center;
  }

  :global(canvas) {
    border: 1px solid #333;
    box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
  }
</style>
