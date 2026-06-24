
/**
 * RetroBox component representing the classic Pokémon Game Boy dialogue box.
 * 
 * Props:
 * @param {React.ReactNode} children - Contents of the box.
 * @param {string} [title] - Optional label shown on the top-left border.
 * @param {string} [theme] - Color theme: 'dmg', 'red', 'blue', 'yellow', or 'default'.
 * @param {boolean} [hasCursor] - Renders a blinking retro pointer cursor (▼) in the bottom-right.
 * @param {string} [className] - Optional additional CSS class.
 * @param {object} [style] - Optional inline style object.
 * @param {function} [onClick] - Optional click handler.
 */
export default function RetroBox({
  children,
  title,
  theme = 'default',
  hasCursor = false,
  className = '',
  style = {},
  onClick,
  ...props
}) {
  const themeClass = theme && theme !== 'default' ? `theme-${theme}` : '';
  const combinedClassName = `retro-box ${themeClass} ${className}`.trim();

  return (
    <div
      className={combinedClassName}
      style={style}
      onClick={onClick}
      {...props}
    >
      {title && <span className="retro-box-title">{title}</span>}
      {children}
      {hasCursor && <span className="retro-box-cursor">▼</span>}
    </div>
  );
}
