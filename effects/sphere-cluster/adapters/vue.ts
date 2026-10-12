/*
 * Vue adapter for SphereCluster. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createSphereCluster, sphereClusterDefaults, type SphereClusterOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const SphereCluster = defineComponent({
  name: 'SphereCluster',
  props: {
    background: { type: String, default: sphereClusterDefaults.background },
    body: { type: String, default: sphereClusterDefaults.body },
    light: { type: String, default: sphereClusterDefaults.light },
    fill: { type: String, default: sphereClusterDefaults.fill },
    count: { type: Number, default: sphereClusterDefaults.count },
    spread: { type: Number, default: sphereClusterDefaults.spread },
    flatten: { type: Number, default: sphereClusterDefaults.flatten },
    size: { type: Number, default: sphereClusterDefaults.size },
    sizeVariation: { type: Number, default: sphereClusterDefaults.sizeVariation },
    breathe: { type: Number, default: sphereClusterDefaults.breathe },
    part: { type: Number, default: sphereClusterDefaults.part },
    partRadius: { type: Number, default: sphereClusterDefaults.partRadius },
    seed: { type: Number, default: sphereClusterDefaults.seed },
    period: { type: Number, default: sphereClusterDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createSphereCluster(host.value, props as Partial<SphereClusterOptions>)
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

export default SphereCluster
