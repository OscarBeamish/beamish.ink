/*
 * Vue adapter for ExpandingTiles. Thin on purpose. It wires a ref to the core
 * and nothing else. If you find yourself adding logic here, it belongs in
 * core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import {
  createExpandingTiles,
  expandingTilesDefaults,
  type ExpandingTilesOptions
} from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const ExpandingTiles = defineComponent({
  name: 'ExpandingTiles',
  props: {
    duration: { type: Number, default: expandingTilesDefaults.duration },
    closeDuration: { type: Number, default: expandingTilesDefaults.closeDuration },
    bleed: { type: Number, default: expandingTilesDefaults.bleed },
    rule: { type: Number, default: expandingTilesDefaults.rule },
    ruleColour: { type: String, default: expandingTilesDefaults.ruleColour },
    lead: { type: Number, default: expandingTilesDefaults.lead },
    follow: { type: Boolean, default: expandingTilesDefaults.follow },
    autoStart: { type: Boolean, default: true }
  },
  setup(props, { slots }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createExpandingTiles(host.value, props as Partial<ExpandingTilesOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /*
     * The tiles come in through the default slot and are never replaced. Lay the
     * grid out with your own CSS on this element: the effect reads where the
     * cells are and opens out of them, and it never positions them.
     */
    return () => h('div', { ref: host }, slots.default?.())
  }
})

export default ExpandingTiles
