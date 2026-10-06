/*
 * Vue adapter for Loupe. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createHalftoneMagnifier, halftoneMagnifierDefaults, type HalftoneMagnifierOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Loupe = defineComponent({
  name: 'Loupe',
  props: {
    paper: { type: String, default: halftoneMagnifierDefaults.paper },
    cyan: { type: String, default: halftoneMagnifierDefaults.cyan },
    magenta: { type: String, default: halftoneMagnifierDefaults.magenta },
    yellow: { type: String, default: halftoneMagnifierDefaults.yellow },
    black: { type: String, default: halftoneMagnifierDefaults.black },
    size: { type: Number, default: halftoneMagnifierDefaults.size },
    zoom: { type: Number, default: halftoneMagnifierDefaults.zoom },
    screen: { type: Number, default: halftoneMagnifierDefaults.screen },
    bulge: { type: Number, default: halftoneMagnifierDefaults.bulge },
    fringe: { type: Number, default: halftoneMagnifierDefaults.fringe },
    rim: { type: Number, default: halftoneMagnifierDefaults.rim },
    grain: { type: Number, default: halftoneMagnifierDefaults.grain },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createHalftoneMagnifier(host.value, props as Partial<HalftoneMagnifierOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update(props as Partial<HalftoneMagnifierOptions>)
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

export default Loupe
