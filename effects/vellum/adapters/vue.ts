/*
 * Vue adapter for Vellum. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createVellum, vellumDefaults, type VellumOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Vellum = defineComponent({
  name: 'Vellum',
  props: {
    paper: { type: String, default: vellumDefaults.paper },
    ink: { type: String, default: vellumDefaults.ink },
    accent: { type: String, default: vellumDefaults.accent },
    sheets: { type: Number, default: vellumDefaults.sheets },
    density: { type: Number, default: vellumDefaults.density },
    spread: { type: Number, default: vellumDefaults.spread },
    radius: { type: Number, default: vellumDefaults.radius },
    sheen: { type: Number, default: vellumDefaults.sheen },
    fibre: { type: Number, default: vellumDefaults.fibre },
    elevation: { type: Number, default: vellumDefaults.elevation },
    azimuth: { type: Number, default: vellumDefaults.azimuth },
    tilt: { type: Number, default: vellumDefaults.tilt },
    zoom: { type: Number, default: vellumDefaults.zoom },
    period: { type: Number, default: vellumDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createVellum(host.value, props as Partial<VellumOptions>)
      if (props.autoStart) handle.start()
    })

    // Every option but `sheets` is a uniform or a camera value, so this is free.
    // Changing the count rebuilds the InstancedMesh; do not bind it to a drag.
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

export default Vellum
