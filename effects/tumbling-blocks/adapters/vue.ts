/*
 * Vue adapter for TumblingBlocks. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createTumblingBlocks, tumblingBlocksDefaults, type TumblingBlocksOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const TumblingBlocks = defineComponent({
  name: 'TumblingBlocks',
  props: {
    near: { type: String, default: tumblingBlocksDefaults.near },
    far: { type: String, default: tumblingBlocksDefaults.far },
    line: { type: String, default: tumblingBlocksDefaults.line },
    cells: { type: Number, default: tumblingBlocksDefaults.cells },
    rotation: { type: Number, default: tumblingBlocksDefaults.rotation },
    thickness: { type: Number, default: tumblingBlocksDefaults.thickness },
    softness: { type: Number, default: tumblingBlocksDefaults.softness },
    variation: { type: Number, default: tumblingBlocksDefaults.variation },
    relief: { type: Number, default: tumblingBlocksDefaults.relief },
    seed: { type: Number, default: tumblingBlocksDefaults.seed },
    period: { type: Number, default: tumblingBlocksDefaults.period },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createTumblingBlocks(host.value, props as Partial<TumblingBlocksOptions>)
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

export default TumblingBlocks
