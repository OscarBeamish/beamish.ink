/*
 * Vue adapter for Contour. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createTerrainRelief, terrainReliefDefaults, type TerrainReliefOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Contour = defineComponent({
  name: 'Contour',
  props: {
    paper: { type: String, default: terrainReliefDefaults.paper },
    land: { type: String, default: terrainReliefDefaults.land },
    ink: { type: String, default: terrainReliefDefaults.ink },
    indexInk: { type: String, default: terrainReliefDefaults.indexInk },
    relief: { type: Number, default: terrainReliefDefaults.relief },
    scale: { type: Number, default: terrainReliefDefaults.scale },
    density: { type: Number, default: terrainReliefDefaults.density },
    weight: { type: Number, default: terrainReliefDefaults.weight },
    elevation: { type: Number, default: terrainReliefDefaults.elevation },
    azimuth: { type: Number, default: terrainReliefDefaults.azimuth },
    tilt: { type: Number, default: terrainReliefDefaults.tilt },
    zoom: { type: Number, default: terrainReliefDefaults.zoom },
    period: { type: Number, default: terrainReliefDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLDivElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createTerrainRelief(host.value, props as Partial<TerrainReliefOptions>)
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
