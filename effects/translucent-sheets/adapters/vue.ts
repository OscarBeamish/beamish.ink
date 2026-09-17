/*
 * Vue adapter for Vellum. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createTranslucentSheets, translucentSheetsDefaults, type TranslucentSheetsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Vellum = defineComponent({
  name: 'Vellum',
  props: {
    paper: { type: String, default: translucentSheetsDefaults.paper },
    ink: { type: String, default: translucentSheetsDefaults.ink },
    accent: { type: String, default: translucentSheetsDefaults.accent },
    sheets: { type: Number, default: translucentSheetsDefaults.sheets },
    density: { type: Number, default: translucentSheetsDefaults.density },
    spread: { type: Number, default: translucentSheetsDefaults.spread },
    radius: { type: Number, default: translucentSheetsDefaults.radius },
    sheen: { type: Number, default: translucentSheetsDefaults.sheen },
    fibre: { type: Number, default: translucentSheetsDefaults.fibre },
    elevation: { type: Number, default: translucentSheetsDefaults.elevation },
    azimuth: { type: Number, default: translucentSheetsDefaults.azimuth },
    tilt: { type: Number, default: translucentSheetsDefaults.tilt },
    zoom: { type: Number, default: translucentSheetsDefaults.zoom },
    period: { type: Number, default: translucentSheetsDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createTranslucentSheets(host.value, props as Partial<TranslucentSheetsOptions>)
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
