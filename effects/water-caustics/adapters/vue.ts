/*
 * Vue adapter for WaterCaustics. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createWaterCaustics, waterCausticsDefaults, type WaterCausticsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const WaterCaustics = defineComponent({
  name: 'WaterCaustics',
  props: {
    water: { type: String, default: waterCausticsDefaults.water },
    light: { type: String, default: waterCausticsDefaults.light },
    scale: { type: Number, default: waterCausticsDefaults.scale },
    depth: { type: Number, default: waterCausticsDefaults.depth },
    waves: { type: Number, default: waterCausticsDefaults.waves },
    thickness: { type: Number, default: waterCausticsDefaults.thickness },
    exposure: { type: Number, default: waterCausticsDefaults.exposure },
    contrast: { type: Number, default: waterCausticsDefaults.contrast },
    dispersion: { type: Number, default: waterCausticsDefaults.dispersion },
    period: { type: Number, default: waterCausticsDefaults.period },
    heading: { type: Number, default: waterCausticsDefaults.heading },
    seed: { type: Number, default: waterCausticsDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createWaterCaustics(host.value, props as Partial<WaterCausticsOptions>)
      if (props.autoStart) handle.start()
    })

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

export default WaterCaustics
