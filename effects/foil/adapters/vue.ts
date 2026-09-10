/*
 * Vue adapter for Foil. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createFoil, foilDefaults, type FoilOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Foil = defineComponent({
  name: 'Foil',
  props: {
    paper: { type: String, default: foilDefaults.paper },
    foilLow: { type: String, default: foilDefaults.foilLow },
    foilHigh: { type: String, default: foilDefaults.foilHigh },
    spokes: { type: Number, default: foilDefaults.spokes },
    scale: { type: Number, default: foilDefaults.scale },
    relief: { type: Number, default: foilDefaults.relief },
    sharpness: { type: Number, default: foilDefaults.sharpness },
    iridescence: { type: Number, default: foilDefaults.iridescence },
    lightHeight: { type: Number, default: foilDefaults.lightHeight },
    grain: { type: Number, default: foilDefaults.grain },
    period: { type: Number, default: foilDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createFoil(host.value, props as Partial<FoilOptions>)
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

    return () => h('div', { ref: host })
  }
})

export default Foil
