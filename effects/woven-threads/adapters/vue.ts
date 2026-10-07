/*
 * Vue adapter for WovenThreads. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createWovenThreads, wovenThreadsDefaults, type WovenThreadsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const WovenThreads = defineComponent({
  name: 'WovenThreads',
  props: {
    ground: { type: String, default: wovenThreadsDefaults.ground },
    warp: { type: String, default: wovenThreadsDefaults.warp },
    weft: { type: String, default: wovenThreadsDefaults.weft },
    pitch: { type: Number, default: wovenThreadsDefaults.pitch },
    width: { type: Number, default: wovenThreadsDefaults.width },
    float: { type: Number, default: wovenThreadsDefaults.float },
    relief: { type: Number, default: wovenThreadsDefaults.relief },
    light: { type: Number, default: wovenThreadsDefaults.light },
    crimp: { type: Number, default: wovenThreadsDefaults.crimp },
    wander: { type: Number, default: wovenThreadsDefaults.wander },
    period: { type: Number, default: wovenThreadsDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createWovenThreads(host.value, props as Partial<WovenThreadsOptions>)
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

export default WovenThreads
