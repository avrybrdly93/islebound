// Fixture for BL-002: the object-property form of dangerouslySetInnerHTML,
// which reaches React through a props spread or a createElement call and
// would slip past a JSX-attribute-only selector.

export const journalProps = {
  className: 'journal',
  dangerouslySetInnerHTML: { __html: '<b>hi</b>' },
};
