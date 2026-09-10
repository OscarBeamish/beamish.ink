/*
 * The Ember demo panel: both tones side by side, because the whole point of the
 * component is the pairing: one solid, one quiet.
 *
 * `createElement` is passed in rather than imported so this file stays free of a
 * React import and the panel controls when React loads.
 */

type CreateElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => unknown

export const render = (createElement: CreateElement, Ember: unknown) =>
  createElement(
    'div',
    {
      style: {
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%'
      }
    },
    createElement(Ember, { key: 'solid' }, 'Get prompt'),
    createElement(Ember, { key: 'quiet', tone: 'quiet' }, 'View source')
  )
