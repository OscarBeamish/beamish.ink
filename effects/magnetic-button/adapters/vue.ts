/*
 * Vue adapter for Magnet. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createMagneticButton, magneticButtonDefaults, type MagneticButtonOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Magnet = defineComponent({
  name: 'Magnet',
  props: {
    /** The element to render. It is the element that moves. */
    tag: { type: String, default: 'button' },
    reach: { type: Number, default: magneticButtonDefaults.reach },
    strength: { type: Number, default: magneticButtonDefaults.strength },
    maxShift: { type: Number, default: magneticButtonDefaults.maxShift },
    scale: { type: Number, default: magneticButtonDefaults.scale },
    rotate: { type: Number, default: magneticButtonDefaults.rotate },
    ease: { type: Number, default: magneticButtonDefaults.ease },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createMagneticButton(host.value, props as Partial<MagneticButtonOptions>)
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

export default Magnet
