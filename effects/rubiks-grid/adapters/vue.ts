/*
 * Vue adapter for RubiksGrid. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createRubiksGrid, rubiksGridDefaults, type RubiksGridOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const RubiksGrid = defineComponent({
  name: 'RubiksGrid',
  props: {
    columns: { type: Number, default: rubiksGridDefaults.columns },
    scheme: { type: String, default: rubiksGridDefaults.scheme },
    turn: { type: Number, default: rubiksGridDefaults.turn },
    rest: { type: Number, default: rubiksGridDefaults.rest },
    moves: { type: Number, default: rubiksGridDefaults.moves },
    sync: { type: Boolean, default: rubiksGridDefaults.sync },
    tilt: { type: Number, default: rubiksGridDefaults.tilt },
    body: { type: String, default: rubiksGridDefaults.body },
    seed: { type: Number, default: rubiksGridDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createRubiksGrid(host.value, props as Partial<RubiksGridOptions>)
      if (props.autoStart) handle.start()
    })

    watchEffect(() => {
      handle?.update({ ...props } as Partial<RubiksGridOptions>)
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h('div', { ref: host })
  }
})

export default RubiksGrid
