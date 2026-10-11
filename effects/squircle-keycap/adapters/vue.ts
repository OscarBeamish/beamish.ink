/*
 * Vue adapter for SquircleKeycap. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createSquircleKeycap, squircleKeycapDefaults, type SquircleKeycapOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const SquircleKeycap = defineComponent({
  name: 'SquircleKeycap',
  props: {
    plate: { type: String, default: squircleKeycapDefaults.plate },
    cap: { type: String, default: squircleKeycapDefaults.cap },
    side: { type: String, default: squircleKeycapDefaults.side },
    ink: { type: String, default: squircleKeycapDefaults.ink },
    legend: { type: String, default: squircleKeycapDefaults.legend },
    corner: { type: Number, default: squircleKeycapDefaults.corner },
    size: { type: Number, default: squircleKeycapDefaults.size },
    depth: { type: Number, default: squircleKeycapDefaults.depth },
    travel: { type: Number, default: squircleKeycapDefaults.travel },
    snap: { type: Number, default: squircleKeycapDefaults.snap },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSquircleKeycap(host.value, props as Partial<SquircleKeycapOptions>)
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

export default SquircleKeycap
