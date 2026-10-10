/*
 * Vue adapter for EmberRise. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createEmberRise, emberRiseDefaults, type EmberRiseOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const EmberRise = defineComponent({
  name: 'EmberRise',
  props: {
    ember: { type: String, default: emberRiseDefaults.ember },
    cool: { type: String, default: emberRiseDefaults.cool },
    count: { type: Number, default: emberRiseDefaults.count },
    rise: { type: Number, default: emberRiseDefaults.rise },
    life: { type: Number, default: emberRiseDefaults.life },
    sway: { type: Number, default: emberRiseDefaults.sway },
    size: { type: Number, default: emberRiseDefaults.size },
    spread: { type: Number, default: emberRiseDefaults.spread },
    heat: { type: Number, default: emberRiseDefaults.heat },
    seed: { type: Number, default: emberRiseDefaults.seed },
    period: { type: Number, default: emberRiseDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createEmberRise(host.value, props as Partial<EmberRiseOptions>)
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

export default EmberRise
