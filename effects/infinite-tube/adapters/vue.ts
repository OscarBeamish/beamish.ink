/*
 * Vue adapter for InfiniteTube. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createInfiniteTube, infiniteTubeDefaults, type InfiniteTubeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const InfiniteTube = defineComponent({
  name: 'InfiniteTube',
  props: {
    period: { type: Number, default: infiniteTubeDefaults.period },
    radius: { type: Number, default: infiniteTubeDefaults.radius },
    bends: { type: Number, default: infiniteTubeDefaults.bends },
    sway: { type: Number, default: infiniteTubeDefaults.sway },
    rings: { type: Number, default: infiniteTubeDefaults.rings },
    spokes: { type: Number, default: infiniteTubeDefaults.spokes },
    weight: { type: Number, default: infiniteTubeDefaults.weight },
    reach: { type: Number, default: infiniteTubeDefaults.reach },
    wall: { type: String, default: infiniteTubeDefaults.wall },
    line: { type: String, default: infiniteTubeDefaults.line },
    lens: { type: Number, default: infiniteTubeDefaults.lens },
    seed: { type: Number, default: infiniteTubeDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createInfiniteTube(host.value, props as Partial<InfiniteTubeOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<InfiniteTubeOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h('div', { ref: host })
  }
})

export default InfiniteTube
