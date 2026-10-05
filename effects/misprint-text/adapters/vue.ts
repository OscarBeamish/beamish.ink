/*
 * Vue adapter for Sort. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createMisprintText, misprintTextDefaults, type MisprintTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Sort = defineComponent({
  name: 'Sort',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    ink: { type: String, default: misprintTextDefaults.ink },
    accent: { type: String, default: misprintTextDefaults.accent },
    second: { type: String, default: misprintTextDefaults.second },
    slip: { type: Number, default: misprintTextDefaults.slip },
    hold: { type: Number, default: misprintTextDefaults.hold },
    chance: { type: Number, default: misprintTextDefaults.chance },
    skew: { type: Number, default: misprintTextDefaults.skew },
    seed: { type: Number, default: misprintTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createMisprintText(host.value, props as Partial<MisprintTextOptions>)
      if (props.autoStart) handle.start()
    }

    onMounted(build)
    // The split has to be rebuilt when the text changes.
    watch(() => props.text, build)

    watchEffect(() => {
      handle?.update({ ...props })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    return () => h(props.tag, { ref: host }, props.text)
  }
})

export default Sort
