import { CiLight } from "react-icons/ci";
import { MdDarkMode } from "react-icons/md";
import { useTheme } from "../theme/themeContext";
import { HIGHLIGHT_OPTIONS, TEXT_OPTIONS, resolveText } from "../theme/theme";

/**
 * Theme picker: background mode, text colour and highlight colour.
 *
 * Swatches are rendered in the colour they select, so the choice is visible
 * without applying it first.
 */
export default function ThemeSettings({ onClose }: { onClose: () => void }) {
    const { theme, setMode, setText, setHighlight } = useTheme();
    const isDark = theme.mode === "dark";

    return (
        <div className="theme-panel" role="dialog" aria-label="Theme settings">
            <div className="theme-panel-head">
                <h2>Theme</h2>
                <button className="theme-close" onClick={onClose} aria-label="Close theme settings">
                    ✕
                </button>
            </div>

            <section className="theme-section">
                <h3>Background</h3>
                <div className="theme-mode-row">
                    <button
                        className={`theme-mode-btn ${!isDark ? "active" : ""}`}
                        onClick={() => setMode("light")}
                        aria-pressed={!isDark}
                    >
                        <CiLight aria-hidden /> Light
                    </button>
                    <button
                        className={`theme-mode-btn ${isDark ? "active" : ""}`}
                        onClick={() => setMode("dark")}
                        aria-pressed={isDark}
                    >
                        <MdDarkMode aria-hidden /> Dark
                    </button>
                </div>
            </section>

            <section className="theme-section">
                <h3>Text colour</h3>
                <div className="theme-swatch-row">
                    {TEXT_OPTIONS.map((option) => {
                        const preview = isDark ? option.dark : option.light;
                        return (
                            <button
                                key={option.id}
                                className={`theme-swatch ${theme.textId === option.id ? "active" : ""}`}
                                onClick={() => setText(option.id)}
                                aria-pressed={theme.textId === option.id}
                                title={option.label}
                            >
                                <span className="swatch-chip" style={{ background: preview }} />
                                <span className="swatch-label">{option.label}</span>
                            </button>
                        );
                    })}
                </div>
                <p className="theme-preview" style={{ color: resolveText(theme)[isDark ? "darkSecondary" : "lightSecondary"] }}>
                    Secondary text looks like this.
                </p>
            </section>

            <section className="theme-section">
                <h3>Highlights</h3>
                <div className="theme-swatch-row">
                    {HIGHLIGHT_OPTIONS.map((option) => (
                        <button
                            key={option.id}
                            className={`theme-swatch ${theme.highlightId === option.id ? "active" : ""}`}
                            onClick={() => setHighlight(option.id)}
                            aria-pressed={theme.highlightId === option.id}
                            title={option.label}
                        >
                            <span className="swatch-chip" style={{ background: option.color }} />
                            <span className="swatch-label">{option.label}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
