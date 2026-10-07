/*
 * Vue adapter for CardStack. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createCardStack, cardStackDefaults, type CardStackOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const CardStack = defineComponent({
  name: 'CardStack',
  props: {
    interval: { type: Number, default: cardStackDefaults.interval },
    travel: { type: Number, default: cardStackDefaults.travel },
    aside: { type: Number, default: cardStackDefaults.aside },
    spread: { type: Number, default: cardStackDefaults.spread },
    shrink: { type: Number, default: cardStackDefaults.shrink },
    tilt: { type: Number, default: cardStackDefaults.tilt },
    lift: { type: Number, default: cardStackDefaults.lift },
    seed: { type: Number, default: cardStackDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createCardStack(host.value, props as Partial<CardStackOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)
    // The split has to be rebuilt when the text changes.

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    // The cards come in through the default slot and are never replaced.
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default CardStack
