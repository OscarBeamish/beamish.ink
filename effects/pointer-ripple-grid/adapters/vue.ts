/*
 * Vue adapter for Swell. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPointerRippleGrid, pointerRippleGridDefaults, type PointerRippleGridOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Swell = defineComponent({
  name: 'Swell',
  props: {
    paper: { type: String, default: pointerRippleGridDefaults.paper },
    stone: { type: String, default: pointerRippleGridDefaults.stone },
    accent: { type: String, default: pointerRippleGridDefaults.accent },
    count: { type: Number, default: pointerRippleGridDefaults.count },
    form: { type: String as () => PointerRippleGridOptions['form'], default: pointerRippleGridDefaults.form },
    thickness: { type: Number, default: pointerRippleGridDefaults.thickness },
    base: { type: Number, default: pointerRippleGridDefaults.base },
    amplitude: { type: Number, default: pointerRippleGridDefaults.amplitude },
    frequency: { type: Number, default: pointerRippleGridDefaults.frequency },
    falloff: { type: Number, default: pointerRippleGridDefaults.falloff },
    elevation: { type: Number, default: pointerRippleGridDefaults.elevation },
    shadow: { type: Number, default: pointerRippleGridDefaults.shadow },
    tilt: { type: Number, default: pointerRippleGridDefaults.tilt },
    zoom: { type: Number, default: pointerRippleGridDefaults.zoom },
    period: { type: Number, default: pointerRippleGridDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPointerRippleGrid(host.value, props as Partial<PointerRippleGridOptions>)
      if (props.autoStart) handle.start()
    })

    // Pushes changed options into the running field rather than remounting it.
    // count, form and thickness rebuild the instanced mesh; the rest are free.
    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h('div', { ref: host })
  }
})

export default Swell
