/*
 * Vue adapter for DustMotes. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createDustMotes, dustMotesDefaults, type DustMotesOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const DustMotes = defineComponent({
  name: 'DustMotes',
  props: {
    ground: { type: String, default: dustMotesDefaults.ground },
    mote: { type: String, default: dustMotesDefaults.mote },
    pitch: { type: Number, default: dustMotesDefaults.pitch },
    size: { type: Number, default: dustMotesDefaults.size },
    haze: { type: Number, default: dustMotesDefaults.haze },
    light: { type: Number, default: dustMotesDefaults.light },
    falloff: { type: Number, default: dustMotesDefaults.falloff },
    drift: { type: Number, default: dustMotesDefaults.drift },
    sparkle: { type: Number, default: dustMotesDefaults.sparkle },
    seed: { type: Number, default: dustMotesDefaults.seed },
    period: { type: Number, default: dustMotesDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createDustMotes(host.value, props as Partial<DustMotesOptions>)
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

export default DustMotes
