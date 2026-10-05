/*
 * Vue adapter for Spotlight. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createSpotlightCard, spotlightCardDefaults, type SpotlightCardOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Spotlight = defineComponent({
  name: 'Spotlight',
  props: {
    /** The element to render. It is the element that leans. */
    light: { type: String, default: spotlightCardDefaults.light },
    sheen: { type: Number, default: spotlightCardDefaults.sheen },
    spread: { type: Number, default: spotlightCardDefaults.spread },
    edge: { type: Number, default: spotlightCardDefaults.edge },
    shade: { type: Number, default: spotlightCardDefaults.shade },
    ease: { type: Number, default: spotlightCardDefaults.ease },
    /* Which element to render. The card is your markup, not this adapter's. */
    tag: { type: String, default: 'div' },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSpotlightCard(host.value, props as Partial<SpotlightCardOptions>)
      if (props.autoStart) handle.start()
    })

    // Pushes changed options into the running effect rather than remounting it.
    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.tag, { ref: host }, slots['default']?.())
  }
})

export default Spotlight
