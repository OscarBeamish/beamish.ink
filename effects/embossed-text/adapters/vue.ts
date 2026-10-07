/*
 * Vue adapter for EmbossedText. Thin on purpose. It wires a ref to the core and
 * nothing else. If you find yourself adding logic here, it belongs in core.ts.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { createEmbossedText, embossedTextDefaults, type EmbossedTextOptions } from '../core'
import type { EffectHandle } from '../../../shared/runtime'

export const EmbossedText = defineComponent({
  name: 'EmbossedText',
  props: {
    text: { type: String, required: true },
    tag: { type: String, default: 'span' },
    paper: { type: String, default: embossedTextDefaults.paper },
    ink: { type: String, default: embossedTextDefaults.ink },
    transfer: { type: Number, default: embossedTextDefaults.transfer },
    depth: { type: Number, default: embossedTextDefaults.depth },
    light: { type: Number, default: embossedTextDefaults.light },
    softness: { type: Number, default: embossedTextDefaults.softness },
    press: { type: Number, default: embossedTextDefaults.press },
    hold: { type: Number, default: embossedTextDefaults.hold },
    spring: { type: Number, default: embossedTextDefaults.spring },
    makeready: { type: Number, default: embossedTextDefaults.makeready },
    seed: { type: Number, default: embossedTextDefaults.seed },
    autoStart: { type: Boolean, default: true }
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    let handle: EffectHandle | null = null

    const build = () => {
      handle?.destroy()
      if (!host.value) return
      handle = createEmbossedText(host.value, props as Partial<EmbossedTextOptions>)
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

export default EmbossedText
