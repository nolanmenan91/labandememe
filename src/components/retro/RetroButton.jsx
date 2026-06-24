
/**
 * RetroButton component representing a classic 3D pixelated button with click-in displacement.
 * 
 * Props:
 * @param {React.ReactNode} children - Button label or contents.
 * @param {function} [onClick] - Click handler function.
 * @param {string} [type] - HTML button type ('button', 'submit', 'reset').
 * @param {boolean} [disabled] - Disabled state.
 * @param {string} [theme] - Color theme: 'dmg', 'red', 'blue', 'yellow', or 'default'.
 * @param {string} [className] - Optional additional CSS class.
 * @param {object} [style] - Optional inline style object.
 */
export default function RetroButton({
  children,
  onClick,
  type = 'button',
  disabled = false,
  theme = 'default',
  className = '',
  style = {},
  ...props
}) {
  const themeClass = theme && theme !== 'default' ? `theme-${theme}` : '';
  const combinedClassName = `retro-btn ${themeClass} ${className}`.trim();

  return (
    <button
      type={type}
      className={combinedClassName}
      onClick={onClick}
      disabled={disabled}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}
