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
    glow: { type: String, default: sphereClusterDefaults.glow },
    light: { type: String, default: sphereClusterDefaults.light },
    keyStrength: { type: Number, default: sphereClusterDefaults.keyStrength },
    ambient: { type: String, default: sphereClusterDefaults.ambient },
    ambientStrength: { type: Number, default: sphereClusterDefaults.ambientStrength },
    distance: { type: Number, default: sphereClusterDefaults.distance },
    intro: { type: Number, default: sphereClusterDefaults.intro },
    stagger: { type: Number, default: sphereClusterDefaults.stagger },
    drop: { type: Number, default: sphereClusterDefaults.drop },
    overshoot: { type: Number, default: sphereClusterDefaults.overshoot },
    breathe: { type: Number, default: sphereClusterDefaults.breathe },
    breatheSpeed: { type: Number, default: sphereClusterDefaults.breatheSpeed },
    part: { type: Number, default: sphereClusterDefaults.part },
    partRadius: { type: Number, default: sphereClusterDefaults.partRadius },
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
