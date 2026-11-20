export default function PlanetFallback() {
  return (
    <div
      className="planet-fallback"
      role="img"
      aria-label="NEBULA X explorer astronaut illustration. 3D rendering is unavailable."
      data-scene-fallback="true"
    >
      <span className="fallback-orbit fallback-orbit-one" />
      <span className="fallback-orbit fallback-orbit-two" />
      <span className="fallback-astronaut" aria-hidden="true">
        <i className="fallback-backpack" />
        <i className="fallback-arm fallback-arm-left" />
        <i className="fallback-arm fallback-arm-right" />
        <i className="fallback-leg fallback-leg-left" />
        <i className="fallback-leg fallback-leg-right" />
        <i className="fallback-boot fallback-boot-left" />
        <i className="fallback-boot fallback-boot-right" />
        <i className="fallback-suit">
          <b className="fallback-insignia">NX</b>
        </i>
        <i className="fallback-helmet">
          <b className="fallback-visor" />
        </i>
      </span>
    </div>
  );
}
