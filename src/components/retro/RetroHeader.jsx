
/**
 * RetroHeader component representing a top-level game banner, menu, or status panel.
 * 
 * Props:
 * @param {string} title - Main header title (rendered in pixel font).
 * @param {string} [subtitle] - Secondary text or subtitle.
 * @param {Array<{label: string, onClick: function, active: boolean}>} [navItems] - Optional navigation links/buttons.
 * @param {string} [theme] - Color theme: 'dmg', 'red', 'blue', 'yellow', or 'default'.
 * @param {string} [className] - Optional additional CSS class.
 * @param {object} [style] - Optional inline style object.
 * @param {React.ReactNode} [children] - Optional extra content to place on the right.
 */
export default function RetroHeader({
  title,
  subtitle,
  navItems = [],
  theme = 'default',
  className = '',
  style = {},
  children,
  ...props
}) {
  const themeClass = theme && theme !== 'default' ? `theme-${theme}` : '';
  const combinedClassName = `retro-header-container ${themeClass} ${className}`.trim();

  return (
    <header className={combinedClassName} style={style} {...props}>
      <div className="retro-header-title-section">
        <h1 className="retro-header-title">{title}</h1>
        {subtitle && <p className="retro-header-subtitle">{subtitle}</p>}
      </div>

      {(navItems.length > 0 || children) && (
        <div className="retro-header-nav">
          {navItems.map((item, index) => (
            <button
              key={index}
              className={`retro-btn ${item.active ? 'active' : ''}`}
              onClick={item.onClick}
              style={item.active ? { backgroundColor: 'var(--code-bg)' } : {}}
            >
              {item.label}
            </button>
          ))}
          {children}
        </div>
      )}
    </header>
  );
}
