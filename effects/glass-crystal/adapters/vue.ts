/*
 * Vue adapter for GlassCrystal. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createGlassCrystal, glassCrystalDefaults, type GlassCrystalOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const GlassCrystal = defineComponent({
  name: 'GlassCrystal',
  props: {
    paper: { type: String, default: glassCrystalDefaults.paper },
    glass: { type: String, default: glassCrystalDefaults.glass },
    key: { type: String, default: glassCrystalDefaults.key },
    fill: { type: String, default: glassCrystalDefaults.fill },
    detail: { type: Number, default: glassCrystalDefaults.detail },
    size: { type: Number, default: glassCrystalDefaults.size },
    thickness: { type: Number, default: glassCrystalDefaults.thickness },
    ior: { type: Number, default: glassCrystalDefaults.ior },
    dispersion: { type: Number, default: glassCrystalDefaults.dispersion },
    roughness: { type: Number, default: glassCrystalDefaults.roughness },
    iridescence: { type: Number, default: glassCrystalDefaults.iridescence },
    rules: { type: Number, default: glassCrystalDefaults.rules },
    ruleWeight: { type: Number, default: glassCrystalDefaults.ruleWeight },
    drift: { type: Number, default: glassCrystalDefaults.drift },
    period: { type: Number, default: glassCrystalDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createGlassCrystal(host.value, props as Partial<GlassCrystalOptions>)
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

export default GlassCrystal
