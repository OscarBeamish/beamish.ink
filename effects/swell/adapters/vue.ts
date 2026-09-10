/*
 * Vue adapter for Swell. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createSwell, swellDefaults, type SwellOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Swell = defineComponent({
  name: 'Swell',
  props: {
    paper: { type: String, default: swellDefaults.paper },
    stone: { type: String, default: swellDefaults.stone },
    accent: { type: String, default: swellDefaults.accent },
    count: { type: Number, default: swellDefaults.count },
    form: { type: String as () => SwellOptions['form'], default: swellDefaults.form },
    thickness: { type: Number, default: swellDefaults.thickness },
    base: { type: Number, default: swellDefaults.base },
    amplitude: { type: Number, default: swellDefaults.amplitude },
    frequency: { type: Number, default: swellDefaults.frequency },
    falloff: { type: Number, default: swellDefaults.falloff },
    elevation: { type: Number, default: swellDefaults.elevation },
    shadow: { type: Number, default: swellDefaults.shadow },
    tilt: { type: Number, default: swellDefaults.tilt },
    zoom: { type: Number, default: swellDefaults.zoom },
    period: { type: Number, default: swellDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSwell(host.value, props as Partial<SwellOptions>)
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
