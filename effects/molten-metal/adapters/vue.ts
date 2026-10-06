/*
 * Vue adapter for MoltenMetal. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createMoltenMetal, moltenMetalDefaults, type MoltenMetalOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const MoltenMetal = defineComponent({
  name: 'MoltenMetal',
  props: {
    metal: { type: String, default: moltenMetalDefaults.metal },
    scale: { type: Number, default: moltenMetalDefaults.scale },
    relief: { type: Number, default: moltenMetalDefaults.relief },
    flow: { type: Number, default: moltenMetalDefaults.flow },
    film: { type: Number, default: moltenMetalDefaults.film },
    variation: { type: Number, default: moltenMetalDefaults.variation },
    iridescence: { type: Number, default: moltenMetalDefaults.iridescence },
    sheen: { type: Number, default: moltenMetalDefaults.sheen },
    shine: { type: Number, default: moltenMetalDefaults.shine },
    lightX: { type: Number, default: moltenMetalDefaults.lightX },
    lightY: { type: Number, default: moltenMetalDefaults.lightY },
    grain: { type: Number, default: moltenMetalDefaults.grain },
    period: { type: Number, default: moltenMetalDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createMoltenMetal(host.value, props as Partial<MoltenMetalOptions>)
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

export default MoltenMetal
