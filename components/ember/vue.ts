/*
 * Ember — Beamish
 * https://beamish.ink/components/ember
 *
 * Vue build of the action pill. Same markup rules as the React one: a <button>
 * by default, an <a> when given an href, because a thing that navigates should be
 * a link and a thing that acts should be a button.
 */

import { computed, defineComponent, h } from 'vue'
import './styles.css'

export const Ember = defineComponent({
  name: 'Ember',
  props: {
    /** `solid` is the accent pill. `quiet` is the outlined secondary. */
    tone: { type: String as () => 'solid' | 'quiet', default: 'solid' },
    href: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
    type: { type: String as () => 'button' | 'submit' | 'reset', default: 'button' }
  },
  setup(props, { slots, attrs }) {
    const className = computed(() => `beamish-ember beamish-ember--${props.tone}`)

    return () => {
      if (props.href !== undefined) {
        return h(
          'a',
          {
            ...attrs,
            href: props.href,
            class: className.value,
            // An anchor cannot be disabled, so say so rather than leaving a dead
            // link that still takes focus and still navigates.
            'aria-disabled': props.disabled ? 'true' : undefined
          },
          slots['default']?.()
        )
      }

      return h(
        'button',
        { ...attrs, type: props.type, disabled: props.disabled, class: className.value },
        slots['default']?.()
      )
    }
  }
})

export default Ember
