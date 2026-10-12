/*
 * Vue adapter for VoronoiCells. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createVoronoiCells, voronoiCellsDefaults, type VoronoiCellsOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const VoronoiCells = defineComponent({
  name: 'VoronoiCells',
  props: {
    near: { type: String, default: voronoiCellsDefaults.near },
    mid: { type: String, default: voronoiCellsDefaults.mid },
    far: { type: String, default: voronoiCellsDefaults.far },
    edge: { type: String, default: voronoiCellsDefaults.edge },
    cells: { type: Number, default: voronoiCellsDefaults.cells },
    wobble: { type: Number, default: voronoiCellsDefaults.wobble },
    thickness: { type: Number, default: voronoiCellsDefaults.thickness },
    softness: { type: Number, default: voronoiCellsDefaults.softness },
    depth: { type: Number, default: voronoiCellsDefaults.depth },
    seed: { type: Number, default: voronoiCellsDefaults.seed },
    period: { type: Number, default: voronoiCellsDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createVoronoiCells(host.value, props as Partial<VoronoiCellsOptions>)
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

export default VoronoiCells
