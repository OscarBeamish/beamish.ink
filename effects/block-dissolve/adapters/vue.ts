/*
 * Vue adapter for BlockDissolve. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createBlockDissolve, blockDissolveDefaults, type BlockDissolveOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const BlockDissolve = defineComponent({
  name: 'BlockDissolve',
  props: {
    order: { type: String, default: blockDissolveDefaults.order },
    columns: { type: Number, default: blockDissolveDefaults.columns },
    spread: { type: Number, default: blockDissolveDefaults.spread },
    grow: { type: Number, default: blockDissolveDefaults.grow },
    overlap: { type: Number, default: blockDissolveDefaults.overlap },
    duration: { type: Number, default: blockDissolveDefaults.duration },
    hold: { type: Number, default: blockDissolveDefaults.hold },
    seed: { type: Number, default: blockDissolveDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createBlockDissolve(host.value, props as Partial<BlockDissolveOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<BlockDissolveOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    // The content is slotted in and clipped, never taken apart.
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default BlockDissolve
