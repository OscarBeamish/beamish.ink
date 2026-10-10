/*
 * Vue adapter for IrisReveal. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createIrisReveal, irisRevealDefaults, type IrisRevealOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const IrisReveal = defineComponent({
  name: 'IrisReveal',
  props: {
    blades: { type: Number, default: irisRevealDefaults.blades },
    swing: { type: Number, default: irisRevealDefaults.swing },
    bow: { type: Number, default: irisRevealDefaults.bow },
    from: { type: Number, default: irisRevealDefaults.from },
    duration: { type: Number, default: irisRevealDefaults.duration },
    hold: { type: Number, default: irisRevealDefaults.hold },
    x: { type: Number, default: irisRevealDefaults.x },
    y: { type: Number, default: irisRevealDefaults.y },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createIrisReveal(host.value, props as Partial<IrisRevealOptions>)
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

export default IrisReveal
