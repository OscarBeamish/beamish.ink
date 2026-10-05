/*
 * Vue adapter for Sort. Thin on purpose. It wires a ref to the core and nothing
 * else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createInkBleedText, inkBleedTextDefaults, type InkBleedTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const Sort = defineComponent({
  name: 'Sort',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    bleed: { type: Number, default: inkBleedTextDefaults.bleed },
    floor: { type: Number, default: inkBleedTextDefaults.floor },
    fibre: { type: Number, default: inkBleedTextDefaults.fibre },
    detail: { type: Number, default: inkBleedTextDefaults.detail },
    period: { type: Number, default: inkBleedTextDefaults.period },
    seed: { type: Number, default: inkBleedTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createInkBleedText(host.value, props as Partial<InkBleedTextOptions>)
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
