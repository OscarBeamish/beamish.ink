/*
 * Vue adapter for Glass. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createLoupe, loupeDefaults, type LoupeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Glass = defineComponent({
  name: 'Glass',
  props: {
    paper: { type: String, default: loupeDefaults.paper },
    cyan: { type: String, default: loupeDefaults.cyan },
    magenta: { type: String, default: loupeDefaults.magenta },
    yellow: { type: String, default: loupeDefaults.yellow },
    black: { type: String, default: loupeDefaults.black },
    size: { type: Number, default: loupeDefaults.size },
    zoom: { type: Number, default: loupeDefaults.zoom },
    screen: { type: Number, default: loupeDefaults.screen },
    bulge: { type: Number, default: loupeDefaults.bulge },
    fringe: { type: Number, default: loupeDefaults.fringe },
    rim: { type: Number, default: loupeDefaults.rim },
    grain: { type: Number, default: loupeDefaults.grain },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createLoupe(host.value, props as Partial<LoupeOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update(props as Partial<LoupeOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /*
     * The slot carries the picture. The effect reads it out of the host element
     * rather than taking it as an option, so rendering an empty div would give
     * you a blank panel and no error.
     */
    return () => h('div', { ref: host }, slots['default']?.())
  }
})

export default Glass
