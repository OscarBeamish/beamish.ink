/*
 * Vue adapter for TruchetMaze. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createTruchetMaze, truchetMazeDefaults, type TruchetMazeOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const TruchetMaze = defineComponent({
  name: 'TruchetMaze',
  props: {
    ground: { type: String, default: truchetMazeDefaults.ground },
    near: { type: String, default: truchetMazeDefaults.near },
    mid: { type: String, default: truchetMazeDefaults.mid },
    far: { type: String, default: truchetMazeDefaults.far },
    cells: { type: Number, default: truchetMazeDefaults.cells },
    thickness: { type: Number, default: truchetMazeDefaults.thickness },
    rotation: { type: Number, default: truchetMazeDefaults.rotation },
    softness: { type: Number, default: truchetMazeDefaults.softness },
    seed: { type: Number, default: truchetMazeDefaults.seed },
    breathe: { type: Number, default: truchetMazeDefaults.breathe },
    wave: { type: Number, default: truchetMazeDefaults.wave },
    tilt: { type: Number, default: truchetMazeDefaults.tilt },
    period: { type: Number, default: truchetMazeDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createTruchetMaze(host.value, props as Partial<TruchetMazeOptions>)
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

export default TruchetMaze
