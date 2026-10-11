/*
 * Vue adapter for DepthPointCloud. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createDepthPointCloud, depthPointCloudDefaults, type DepthPointCloudOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const DepthPointCloud = defineComponent({
  name: 'DepthPointCloud',
  props: {
    background: { type: String, default: depthPointCloudDefaults.background },
    relief: { type: Number, default: depthPointCloudDefaults.relief },
    density: { type: Number, default: depthPointCloudDefaults.density },
    size: { type: Number, default: depthPointCloudDefaults.size },
    drift: { type: Number, default: depthPointCloudDefaults.drift },
    spin: { type: Number, default: depthPointCloudDefaults.spin },
    period: { type: Number, default: depthPointCloudDefaults.period },
    wash: { type: Number, default: depthPointCloudDefaults.wash },
    ink: { type: String, default: depthPointCloudDefaults.ink },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createDepthPointCloud(host.value, props as Partial<DepthPointCloudOptions>)
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

export default DepthPointCloud
