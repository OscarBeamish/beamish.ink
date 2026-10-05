/*
 * Vue adapter for Lamp. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createRelightImage, relightImageDefaults, type RelightImageOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Lamp = defineComponent({
  name: 'Lamp',
  props: {
    light: { type: String, default: relightImageDefaults.light },
    height: { type: Number, default: relightImageDefaults.height },
    relief: { type: Number, default: relightImageDefaults.relief },
    smooth: { type: Number, default: relightImageDefaults.smooth },
    strength: { type: Number, default: relightImageDefaults.strength },
    gloss: { type: Number, default: relightImageDefaults.gloss },
    shine: { type: Number, default: relightImageDefaults.shine },
    reach: { type: Number, default: relightImageDefaults.reach },
    grain: { type: Number, default: relightImageDefaults.grain },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createRelightImage(host.value, props as Partial<RelightImageOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update(props as Partial<RelightImageOptions>)
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

export default Lamp
