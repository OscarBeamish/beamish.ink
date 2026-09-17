/*
 * Vue adapter for Foil. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createPointerFoilSheen, pointerFoilSheenDefaults, type PointerFoilSheenOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Foil = defineComponent({
  name: 'Foil',
  props: {
    paper: { type: String, default: pointerFoilSheenDefaults.paper },
    foilLow: { type: String, default: pointerFoilSheenDefaults.foilLow },
    foilHigh: { type: String, default: pointerFoilSheenDefaults.foilHigh },
    spokes: { type: Number, default: pointerFoilSheenDefaults.spokes },
    scale: { type: Number, default: pointerFoilSheenDefaults.scale },
    relief: { type: Number, default: pointerFoilSheenDefaults.relief },
    sharpness: { type: Number, default: pointerFoilSheenDefaults.sharpness },
    iridescence: { type: Number, default: pointerFoilSheenDefaults.iridescence },
    lightHeight: { type: Number, default: pointerFoilSheenDefaults.lightHeight },
    grain: { type: Number, default: pointerFoilSheenDefaults.grain },
    period: { type: Number, default: pointerFoilSheenDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createPointerFoilSheen(host.value, props as Partial<PointerFoilSheenOptions>)
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
