
/**
 * RetroInput component representing a pixel-styled form input.
 * 
 * Props:
 * @param {string} [label] - Optional field label.
 * @param {string} [error] - Optional validation error message.
 * @param {string} [theme] - Color theme: 'dmg', 'red', 'blue', 'yellow', or 'default'.
 * @param {string} [className] - Optional additional class for the input element.
 * @param {object} [style] - Optional inline style object for the wrapper.
 */
export default function RetroInput({
  label,
  error,
  theme = 'default',
  className = '',
  style = {},
  ...props
}) {
  const themeClass = theme && theme !== 'default' ? `theme-${theme}` : '';
  const wrapperClass = `retro-input-wrapper ${themeClass}`.trim();
  const inputClass = `retro-input ${className}`.trim();

  return (
    <div className={wrapperClass} style={style}>
      {label && <label className="retro-input-label">{label}</label>}
      <input
        className={inputClass}
        {...props}
      />
      {error && <span className="retro-input-error">{error}</span>}
    </div>
  );
}
