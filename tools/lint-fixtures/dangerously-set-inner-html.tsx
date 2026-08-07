// Fixture for BL-002: the JSX-attribute form of dangerouslySetInnerHTML.

export function JournalEntry(props: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: props.html }} />;
}
