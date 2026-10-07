/*
 * Vue adapter for GradualBlur. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGradualBlur, gradualBlurDefaults, type GradualBlurOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const GradualBlur = defineComponent({
  name: 'GradualBlur',
  props: {
    edge: { type: String, default: gradualBlurDefaults.edge },
    depth: { type: Number, default: gradualBlurDefaults.depth },
    strength: { type: Number, default: gradualBlurDefaults.strength },
    layers: { type: Number, default: gradualBlurDefaults.layers },
    tint: { type: String, default: gradualBlurDefaults.tint },
    wash: { type: Number, default: gradualBlurDefaults.wash },
    follow: { type: Boolean, default: gradualBlurDefaults.follow },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGradualBlur(host.value, props as Partial<GradualBlurOptions>)
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

export default GradualBlur
