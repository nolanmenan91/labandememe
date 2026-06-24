
/**
 * RetroCrt component that overlays scanlines, vignettes, and screen flickers
 * to replicate a classic CRT monitor or old-school handheld screen.
 * 
 * Props:
 * @param {boolean} [scanlines] - Toggle horizontal line overlay (default: true).
 * @param {boolean} [flicker] - Toggle subtle screen brightness flicker (default: true).
 * @param {boolean} [vignette] - Toggle shadow vignettes around corners (default: true).
 */
export default function RetroCrt({
  scanlines = true,
  flicker = true,
  vignette = true
}) {
  return (
    <>
      {scanlines && <div className="scanlines" />}
      {flicker && <div className="crt-flicker" />}
      {vignette && <div className="crt-vignette" />}
    </>
  );
}
