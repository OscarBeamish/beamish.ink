/*
 * Vue adapter for Contour. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createContour, contourDefaults, type ContourOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Contour = defineComponent({
  name: 'Contour',
  props: {
    paper: { type: String, default: contourDefaults.paper },
    land: { type: String, default: contourDefaults.land },
    ink: { type: String, default: contourDefaults.ink },
    indexInk: { type: String, default: contourDefaults.indexInk },
    relief: { type: Number, default: contourDefaults.relief },
    scale: { type: Number, default: contourDefaults.scale },
    density: { type: Number, default: contourDefaults.density },
    weight: { type: Number, default: contourDefaults.weight },
    elevation: { type: Number, default: contourDefaults.elevation },
    azimuth: { type: Number, default: contourDefaults.azimuth },
    tilt: { type: Number, default: contourDefaults.tilt },
    zoom: { type: Number, default: contourDefaults.zoom },
    period: { type: Number, default: contourDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createContour(host.value, props as Partial<ContourOptions>)
      if (props.autoStart) handle.start()
    })

    // Every option is a uniform, so this is free and nothing rebuilds.
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

export default Contour
