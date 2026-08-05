// Fixture for BL-002: the dangerouslySetInnerHTML ban (31 §3).
// Linted by tools/check-lint-rules.mjs, ESLint-ignored everywhere else.

declare const html: string;
declare const label: string;

// VIOLATION: injected markup, as a JSX attribute.
export const Tooltip = () => <div dangerouslySetInnerHTML={{ __html: html }} />;

// VIOLATION: the same escape hatch, built as props first.
export const spreadTooltip = () => {
  const props = { dangerouslySetInnerHTML: { __html: html } };
  return <div {...props} />;
};

// COMPLIANT: text rendered as text. Must not report.
export const SafeTooltip = () => <div title={label}>{label}</div>;
