// FIXTURE — deliberately violates the dangerouslySetInnerHTML ban
// (no-restricted-syntax). Linted only by tools/check-lint-rules.mjs.
export function Banner(props: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}
