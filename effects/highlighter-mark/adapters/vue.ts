/*
 * Vue adapter for HighlighterMark. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { createHighlighterMark, highlighterMarkDefaults, type HighlighterMarkOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const HighlighterMark = defineComponent({
  name: 'HighlighterMark',
  props: {
    selector: { type: String, default: highlighterMarkDefaults.selector },
    ink: { type: String, default: highlighterMarkDefaults.ink },
    strength: { type: Number, default: highlighterMarkDefaults.strength },
    height: { type: Number, default: highlighterMarkDefaults.height },
    overshoot: { type: Number, default: highlighterMarkDefaults.overshoot },
    tilt: { type: Number, default: highlighterMarkDefaults.tilt },
    rag: { type: Number, default: highlighterMarkDefaults.rag },
    duration: { type: Number, default: highlighterMarkDefaults.duration },
    stagger: { type: Number, default: highlighterMarkDefaults.stagger },
    hold: { type: Number, default: highlighterMarkDefaults.hold },
    seed: { type: Number, default: highlighterMarkDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    onMounted(() => {
      if (!host.value) return
      handle = createHighlighterMark(host.value, props as Partial<HighlighterMarkOptions>)
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

export default HighlighterMark
