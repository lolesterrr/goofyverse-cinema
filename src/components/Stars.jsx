export const starText = (v) => (v == null ? "" : "★".repeat(Math.floor(v)) + (v % 1 ? "½" : ""));

export function Stars({ value, className = "" }) {
  if (value == null) {
    return (
      <span className={`stars none ${className}`} role="img" aria-label="Not rated">
        –
      </span>
    );
  }
  return (
    <span className={`stars ${className}`} role="img" aria-label={`${value} out of 5 stars`}>
      {starText(value)}
    </span>
  );
}

// Click the left half of a star for a half rating, the right half for a whole one.
export function StarInput({ value, onChange, label = "Rating" }) {
  return (
    <div className="star-input" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => {
        const state = value != null && value >= n ? "full" : value != null && value >= n - 0.5 ? "half" : "";
        return (
          <span key={n} className="star-cell">
            <span className={`star-glyph ${state}`} aria-hidden="true">
              ★
            </span>
            <button
              type="button"
              className="star-hit left"
              aria-label={`${n - 0.5} stars`}
              aria-pressed={value === n - 0.5}
              onClick={() => onChange(value === n - 0.5 ? null : n - 0.5)}
            />
            <button
              type="button"
              className="star-hit right"
              aria-label={`${n} stars`}
              aria-pressed={value === n}
              onClick={() => onChange(value === n ? null : n)}
            />
          </span>
        );
      })}
      <span className="star-value">{value == null ? "Not rated" : `${value} / 5`}</span>
      {value != null && (
        <button type="button" className="link-btn" onClick={() => onChange(null)}>
          Clear
        </button>
      )}
    </div>
  );
}
