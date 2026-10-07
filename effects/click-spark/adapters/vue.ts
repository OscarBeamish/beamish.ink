/*
 * Vue adapter for ClickSpark. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createClickSpark, clickSparkDefaults, type ClickSparkOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const ClickSpark = defineComponent({
  name: 'ClickSpark',
  props: {
    count: { type: Number, default: clickSparkDefaults.count },
    bursts: { type: Number, default: clickSparkDefaults.bursts },
    colour: { type: String, default: clickSparkDefaults.colour },
    speed: { type: Number, default: clickSparkDefaults.speed },
    drag: { type: Number, default: clickSparkDefaults.drag },
    gravity: { type: Number, default: clickSparkDefaults.gravity },
    life: { type: Number, default: clickSparkDefaults.life },
    streak: { type: Number, default: clickSparkDefaults.streak },
    thickness: { type: Number, default: clickSparkDefaults.thickness },
    scatter: { type: Number, default: clickSparkDefaults.scatter },
    seed: { type: Number, default: clickSparkDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createClickSpark(host.value, props as Partial<ClickSparkOptions>)
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

export default ClickSpark
